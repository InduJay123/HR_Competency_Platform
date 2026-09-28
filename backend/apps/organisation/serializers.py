from rest_framework import serializers

from .models import Department, EmployeeProfile, JobRole


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "name"]


class JobRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobRole
        fields = ["id", "name"]


class EmployeeSerializer(serializers.ModelSerializer):
    stewardship_code = serializers.CharField(source="membership.stewardship_code", read_only=True)
    platform_joined_at = serializers.SerializerMethodField()

    def get_platform_joined_at(self, obj):
        return obj.membership.approved_at or obj.membership.created_at

    photo_url = serializers.SerializerMethodField()
    first_name = serializers.CharField(source="membership.user.first_name", read_only=True)
    last_name = serializers.CharField(source="membership.user.last_name", read_only=True)
    email = serializers.EmailField(source="membership.user.email", read_only=True)
    is_manager = serializers.BooleanField(source="membership.is_manager", read_only=True)
    manager_id = serializers.SerializerMethodField()

    def get_manager_id(self, obj):
        return str(obj.reporting.manager_id) if hasattr(obj, "reporting") else None

    def get_photo_url(self, obj):
        has_avatar = obj.has_avatar if hasattr(obj, "has_avatar") else bool(obj.avatar_data)
        if has_avatar:
            return f"/api/v1/employees/{obj.id}/photo/?v={obj.version}"
        return obj.photo_url

    class Meta:
        model = EmployeeProfile
        fields = [
            "id",
            "stewardship_code",
            "platform_joined_at",
            "first_name",
            "last_name",
            "email",
            "designation",
            "department",
            "job_role",
            "joined_on",
            "photo_url",
            "senior_leader",
            "is_manager",
            "manager_id",
            "version",
            "onboarding_completed_at",
        ]


class EmployeeCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    designation = serializers.CharField(max_length=160, required=False, allow_blank=True)
    joined_on = serializers.DateField(required=False, allow_null=True)
    department = serializers.UUIDField(required=False, allow_null=True)
    job_role = serializers.UUIDField(required=False, allow_null=True)
    is_manager = serializers.BooleanField(default=False)
    senior_leader = serializers.BooleanField(default=False)


class ReportingSerializer(serializers.Serializer):
    manager_id = serializers.UUIDField(allow_null=True)
    version = serializers.IntegerField(min_value=1)


class SelfProfileSerializer(EmployeeSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default="")
    manager_name = serializers.SerializerMethodField()

    def get_manager_name(self, obj):
        return obj.reporting.manager.membership.user.get_full_name() if hasattr(obj, "reporting") else ""

    class Meta(EmployeeSerializer.Meta):
        fields = EmployeeSerializer.Meta.fields + [
            "phone",
            "contact_email",
            "employment_company",
            "location",
            "bio",
            "skills",
            "company_name",
            "department_name",
            "manager_name",
            "notification_digest",
        ]
