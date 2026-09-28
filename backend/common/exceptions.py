from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.views import exception_handler


class Conflict(APIException):
    status_code = 409
    default_detail = "This record changed. Refresh and try again."


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(getattr(exc, "message_dict", exc.messages))
    response = exception_handler(exc, context)
    if response is not None:
        response.data = {"error": {"status": response.status_code, "details": response.data}}
    return response
