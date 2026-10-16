from pathlib import Path

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import get_valid_filename
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.companies.models import Company, PlatformEvent
from apps.companies.platform import IsPlatformAdmin
from common.permissions import membership, require_manager

from . import storage
from .files import render_pdf, validate_file
from .models import BillingSettings, CompanyInvoice, PaymentProof
from .serializers import InvoiceSerializer, ProofSerializer, SettingsSerializer, UploadSerializer
from .services import audit, ensure_current_invoices, ensure_invoice, today


def chief(request):
    member = membership(request, suspended_access="billing")
    require_manager(member)
    return member


def scoped_invoices(request):
    qs = CompanyInvoice.objects.all()
    if not request.user.is_superuser:
        qs = qs.filter(company_id=chief(request).company_id)
    return qs


class CurrentInvoice(APIView):
    def get(self, request):
        invoice = ensure_invoice(chief(request).company_id)
        return Response(InvoiceSerializer(invoice).data if invoice else None)


class History(APIView):
    def get(self, request):
        return Response(
            InvoiceSerializer(
                CompanyInvoice.objects.filter(company_id=chief(request).company_id).prefetch_related(
                    "proofs__uploaded_by"
                ),
                many=True,
            ).data
        )


class UploadProof(APIView):
    def post(self, request):
        member = chief(request)
        serializer = UploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        content, extension = validate_file(data["file"])
        current = ensure_invoice(member.company_id)
        if not current:
            raise ValidationError("No payment proof is currently required.")
        with transaction.atomic():
            invoice = CompanyInvoice.objects.select_for_update().get(pk=current.pk)
            if invoice.status != CompanyInvoice.Status.AWAITING_PAYMENT:
                raise ValidationError("This invoice is paid or already awaiting verification.")
            proof = PaymentProof(
                invoice=invoice,
                uploaded_by=request.user,
                original_filename=get_valid_filename(Path(data["file"].name.replace("\\", "/")).name)[:180],
                content_type=data["file"].content_type,
                file_size=len(content),
                transaction_reference=data["transaction_reference"],
                payment_date=data["payment_date"],
            )
            proof.storage_path = (
                f"companies/{invoice.company_id}/{invoice.billing_year}/{invoice.pk}/{proof.pk}{extension}"
            )
            storage.put(proof.storage_path, content, proof.content_type, bucket="billing-payment-proofs")
            proof.save()
            invoice.status = CompanyInvoice.Status.PAYMENT_PROOF_SUBMITTED
            invoice.save(update_fields=["status", "updated_at"])
            audit(invoice, "billing.payment_proof_submitted", request.user, proof=str(proof.pk))
        return Response(ProofSerializer(proof).data, status=201)


def file_response(content, mime, name, download=False):
    response = HttpResponse(content, content_type=mime)
    response["Content-Disposition"] = f'{"attachment" if download else "inline"}; filename="{name}"'
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "sandbox"
    return response


class InvoicePDF(APIView):
    def get(self, request, pk):
        # Authorize before rendering or accessing private storage.
        authorized = get_object_or_404(scoped_invoices(request), pk=pk)
        with transaction.atomic():
            invoice = CompanyInvoice.objects.select_for_update().get(pk=authorized.pk)
            content = render_pdf(invoice)
            key = f"companies/{invoice.company_id}/{invoice.billing_year}/{invoice.pk}.pdf"
            # Regenerate to reflect current status; financial/issuer fields remain frozen.
            storage.put(key, content, "application/pdf", bucket="billing-invoices", upsert=True)
            invoice.invoice_storage_path = key
            invoice.save(update_fields=["invoice_storage_path"])
        return file_response(
            content,
            "application/pdf",
            f"{invoice.invoice_number}.pdf",
            request.query_params.get("download") == "1",
        )


class ProofFile(APIView):
    def get(self, request, pk):
        proof = get_object_or_404(PaymentProof.objects.filter(invoice__in=scoped_invoices(request)), pk=pk)
        content = storage.get(proof.storage_path, bucket="billing-payment-proofs")
        return file_response(
            content, proof.content_type, f"proof-{proof.pk}{Path(proof.storage_path).suffix}"
        )


class PlatformView(APIView):
    permission_classes = [IsPlatformAdmin]


class Settings(PlatformView):
    def get(self, request):
        config, _ = BillingSettings.objects.get_or_create(pk=1)
        return Response(SettingsSerializer(config).data)

    def put(self, request):
        with transaction.atomic():
            config, _ = BillingSettings.objects.get_or_create(pk=1)
            config = BillingSettings.objects.select_for_update().get(pk=config.pk)
            serializer = SettingsSerializer(config, data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            PlatformEvent.objects.create(actor=request.user, action="billing.settings_updated")
        ensure_current_invoices()
        return Response(serializer.data)


def year_filter(request):
    value = serializers.IntegerField(min_value=2000, max_value=9999)
    return value.run_validation(request.query_params.get("year", today().year))


class Overview(PlatformView):
    def get(self, request):
        ensure_current_invoices()
        invoices = CompanyInvoice.objects.filter(billing_year=year_filter(request))
        return Response(
            {
                "total_companies": Company.objects.count(),
                "invoices_issued": invoices.count(),
                "paid": invoices.filter(status="PAID").count(),
                "awaiting_payment": invoices.filter(status="AWAITING_PAYMENT").count(),
                "proofs_awaiting_review": PaymentProof.objects.filter(
                    invoice__in=invoices, status="PENDING"
                ).count(),
                "overdue": invoices.exclude(status="PAID").filter(due_at__lt=today()).count(),
            }
        )


class Invoices(PlatformView):
    def get(self, request):
        ensure_current_invoices()
        qs = CompanyInvoice.objects.filter(billing_year=year_filter(request)).prefetch_related(
            "proofs__uploaded_by"
        )
        if request.query_params.get("company"):
            company_id = serializers.UUIDField().run_validation(request.query_params["company"])
            qs = qs.filter(company_id=company_id)
        status = request.query_params.get("status")
        if status == "OVERDUE":
            qs = qs.exclude(status="PAID").filter(due_at__lt=today())
        elif status:
            status = serializers.ChoiceField(choices=CompanyInvoice.Status.values).run_validation(status)
            qs = qs.filter(status=status)
        return Response(InvoiceSerializer(qs, many=True).data)


class Proofs(PlatformView):
    def get(self, request):
        qs = PaymentProof.objects.select_related("invoice", "uploaded_by").filter(
            invoice__billing_year=year_filter(request)
        )
        return Response(ProofSerializer(qs, many=True).data)


class VerifyProof(PlatformView):
    def post(self, request, pk, decision):
        reason = serializers.CharField(max_length=2000, allow_blank=True).run_validation(
            request.data.get("rejection_reason", "")
        )
        if decision == "reject" and not reason.strip():
            raise ValidationError("A rejection reason is required.")
        initial = get_object_or_404(PaymentProof, pk=pk)
        with transaction.atomic():
            invoice = CompanyInvoice.objects.select_for_update().get(pk=initial.invoice_id)
            proof = PaymentProof.objects.select_for_update().get(pk=pk)
            if (
                proof.status != PaymentProof.Status.PENDING
                or invoice.status != CompanyInvoice.Status.PAYMENT_PROOF_SUBMITTED
            ):
                raise ValidationError("This payment proof has already been reviewed.")
            proof.status = (
                PaymentProof.Status.APPROVED if decision == "approve" else PaymentProof.Status.REJECTED
            )
            proof.verified_by = request.user
            proof.verified_at = timezone.now()
            proof.rejection_reason = reason if decision == "reject" else ""
            proof.save()
            invoice.status = (
                CompanyInvoice.Status.PAID
                if decision == "approve"
                else CompanyInvoice.Status.AWAITING_PAYMENT
            )
            invoice.paid_at = proof.verified_at if decision == "approve" else None
            invoice.save(update_fields=["status", "paid_at", "updated_at"])
            audit(
                invoice,
                f"billing.payment_proof_{'approved' if decision == 'approve' else 'rejected'}",
                request.user,
                proof=str(proof.pk),
                reason=proof.rejection_reason,
            )
            if decision == "approve":
                audit(invoice, "billing.invoice_paid", request.user, proof=str(proof.pk))
        return Response(ProofSerializer(proof).data)
