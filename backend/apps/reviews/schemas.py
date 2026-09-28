from rest_framework.exceptions import ValidationError

PILLARS = ["character", "contribution", "capability", "context", "continuity"]
DESCRIPTORS = ["Exceptional", "Strong", "Developing", "Needs Attention"]
ECP = ["Stars", "Growers", "Workhorses", "Under-Supported"]
OVERALL = ["Exceptional Steward", "Strong Steward", "Developing Steward", "Stewardship at Risk"]


def text(data, key):
    if not isinstance(data, dict):
        raise ValidationError("Each form section must contain named responses.")
    value = data.get(key)
    if not isinstance(value, str) or not value.strip() or len(value) > 20000:
        raise ValidationError({key: "Provide a clear response (maximum 20,000 characters)."})
    return value


def validate_form(kind, content):
    if not isinstance(content, dict):
        raise ValidationError("Form content must be an object.")
    if kind == "EMPLOYEE":
        for key in [
            "outcomes",
            "results",
            "contributions",
            "capability",
            "legacy",
            "barriers",
            "support",
            "prior_progress",
        ]:
            text(content, key)
        for pillar in PILLARS:
            text(content.get("pillars", {}), pillar)
    else:
        if content.get("ecp") not in ECP:
            raise ValidationError({"ecp": "Choose a human ECP assessment."})
        for key in [
            "rationale",
            "contributions",
            "prior_progress",
            "next_success",
            "strengths",
            "gaps",
            "knowledge",
            "people",
            "systems",
            "summary",
            "ecp_contribution",
            "ecp_potential",
            "development_actions",
            "relationships",
        ]:
            text(content, key)
        if not isinstance(content.get("pillars"), dict):
            raise ValidationError("Provide all five pillars.")
        for pillar in PILLARS:
            row = content.get("pillars", {}).get(pillar, {})
            text(row, "narrative")
            if row.get("descriptor") not in DESCRIPTORS:
                raise ValidationError({pillar: "Choose a qualitative descriptor."})
            refs = row.get("evidence_ids", [])
            if not isinstance(refs, list) or any(not isinstance(r, str) for r in refs):
                raise ValidationError({pillar: "Evidence references must be a list of selected source IDs."})
        if content.get("overall") not in OVERALL:
            raise ValidationError({"overall": "Choose an overall human assessment."})
        if content["ecp"] == "Under-Supported" or any(
            content["pillars"][p].get("descriptor") == "Needs Attention" for p in PILLARS
        ):
            text(content, "intervention")
            causes = content.get("causes", [])
            if (
                not causes
                or not isinstance(causes, list)
                or any(
                    c not in ["Ability", "Motivation", "Opportunity", "Role Fit", "Manager / System"]
                    for c in causes
                )
            ):
                raise ValidationError(
                    {"causes": "Identify execution-gap factors, including context and support."}
                )
    return content
