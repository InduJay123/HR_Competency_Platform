import re

from rest_framework import serializers

from .models import BillingSettings, CompanyInvoice, PaymentProof
from .services import overdue, today


class SettingsSerializer(serializers.ModelSerializer):
    frequency = serializers.ReadOnlyField(default="YEARLY")

    class Meta:
        model = BillingSettings
        # Retain legacy columns in the database, but no longer configure them.
        exclude = ["id", "invoice_prefix", "issue_month", "issue_day", "tax_number", "tax_rate"]

    def validate(self, attrs):
        values = (
            {f.name: getattr(self.instance, f.name) for f in BillingSettings._meta.fields}
            if self.instance
            else {}
        )
        values.update(attrs)
        if not 0 <= values.get("due_days", 30) <= 365:
            raise serializers.ValidationError("Due period must be between 0 and 365 days.")
        fee = values.get("annual_fee")
        if fee is not None and not 0 <= fee <= 499999999999:
            raise serializers.ValidationError("Annual fee is outside the supported range.")
        if values.get("currency") and not re.fullmatch(r"[A-Z]{3}", values["currency"]):
            raise serializers.ValidationError("Currency must be a three-letter uppercase code.")
        if values.get("active") and (
            fee is None
            or any(
                not str(values.get(k, "")).strip()
                for k in [
                    "currency",
                    "issuer_name",
                    "bank_name",
                    "bank_account_name",
                    "bank_account_number",
                ]
            )
        ):
            raise serializers.ValidationError(
                "Configure annual fee, currency, issuer and bank account before activating billing."
            )
        return attrs


class ProofSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="invoice.snapshot.customer_name", read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    amount = serializers.DecimalField(
        source="invoice.total_amount", max_digits=14, decimal_places=2, read_only=True
    )
    currency = serializers.CharField(source="invoice.currency", read_only=True)
    submitted_by = serializers.CharField(source="uploaded_by.email", read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = PaymentProof
        exclude = ["storage_path"]

    def get_file_url(self, obj):
        return f"/api/v1/billing/payment-proofs/{obj.pk}/file/"


class InvoiceSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="snapshot.customer_name", read_only=True)
    is_overdue = serializers.SerializerMethodField()
    proofs = ProofSerializer(many=True, read_only=True)
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = CompanyInvoice
        exclude = ["invoice_storage_path"]

    def get_is_overdue(self, obj):
        return overdue(obj)

    def get_pdf_url(self, obj):
        return f"/api/v1/billing/invoices/{obj.pk}/pdf/"


class UploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    transaction_reference = serializers.CharField(max_length=180)
    payment_date = serializers.DateField()

    def validate_payment_date(self, value):
        if value > today():
            raise serializers.ValidationError("Payment date cannot be in the future.")
        return value
