from django.urls import path

from . import views

urlpatterns = [
    path("billing/current/", views.CurrentInvoice.as_view()),
    path("billing/history/", views.History.as_view()),
    path("billing/current/payment-proof/", views.UploadProof.as_view()),
    path("billing/invoices/<uuid:pk>/pdf/", views.InvoicePDF.as_view()),
    path("billing/payment-proofs/<uuid:pk>/file/", views.ProofFile.as_view()),
    path("platform/billing/settings/", views.Settings.as_view()),
    path("platform/billing/overview/", views.Overview.as_view()),
    path("platform/billing/invoices/", views.Invoices.as_view()),
    path("platform/billing/payment-proofs/", views.Proofs.as_view()),
    path(
        "platform/billing/payment-proofs/<uuid:pk>/approve/",
        views.VerifyProof.as_view(),
        {"decision": "approve"},
    ),
    path(
        "platform/billing/payment-proofs/<uuid:pk>/reject/",
        views.VerifyProof.as_view(),
        {"decision": "reject"},
    ),
]
