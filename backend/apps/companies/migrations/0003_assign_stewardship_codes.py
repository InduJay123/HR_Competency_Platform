from django.db import migrations


def assign(apps, schema_editor):
    Company = apps.get_model("companies", "Company")
    Membership = apps.get_model("companies", "Membership")
    Sequence = apps.get_model("companies", "CodeSequence")
    counter, _ = Sequence.objects.get_or_create(pk=1)
    for company in Company.objects.order_by("created_at", "id"):
        counter.value += 1
        company.stewardship_code = f"ST{counter.value:04d}"
        company.approved_at = company.created_at
        for i, member in enumerate(Membership.objects.filter(company=company).order_by("created_at", "id"), 1):
            member.stewardship_code = f"{company.stewardship_code}-{i}"
            member.approved_at = member.created_at
            member.save(update_fields=["stewardship_code", "approved_at"])
            company.employee_sequence = i
        company.save(update_fields=["stewardship_code", "approved_at", "employee_sequence"])
    counter.save()


class Migration(migrations.Migration):
    dependencies = [("companies", "0002_codesequence_company_approved_at_company_country_and_more")]
    operations = [migrations.RunPython(assign, migrations.RunPython.noop)]
