"""Fresh five-pillar coaching fixtures; mutations never leak between tests."""

PILLAR_NAMES = ("context", "character", "capability", "continuity", "contribution")


def empty_pillar_coaching():
    return {"pillar_coaching": {
        pillar: {"strengths": [], "gaps": [], "support_options": [], "limitations": []}
        for pillar in PILLAR_NAMES
    }}


def context_coaching(content):
    output = empty_pillar_coaching()
    output["pillar_coaching"]["context"].update(content)
    return output
