from rest_framework import serializers


class PricingInput(serializers.Serializer):
    market = serializers.ChoiceField(choices=["SL", "REGIONAL", "GLOBAL"])
    employees = serializers.IntegerField(min_value=1, max_value=10000000)
    white_label = serializers.BooleanField(default=False)
    workshop = serializers.BooleanField(default=False)
    coaching_quarters = serializers.IntegerField(min_value=0, max_value=4, default=0)
    custom_annual = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, required=False)
    note = serializers.CharField(max_length=2000, allow_blank=True, required=False)


def calculate(data):
    market, count = data["market"], data["employees"]
    prices = {
        "SL": [150000, 350000, 500000, 750000],
        "REGIONAL": [299, 999, 1667, 2499],
        "GLOBAL": [999, 2499, 4999, 7999],
    }
    band = next((i for i, limit in enumerate([50, 250, 500, 1000]) if count <= limit), None)
    tier = ["Starter", "Growth", "Corporate", "Enterprise"][band] if band is not None else "Custom"
    annual = prices[market][band] if band is not None else None
    if data.get("white_label"):
        if market != "GLOBAL":
            raise serializers.ValidationError("White label pricing is listed only for the Global market.")
        tier, annual = "White Label Partner", 15000
    if "custom_annual" in data:
        if not data.get("note", "").strip():
            raise serializers.ValidationError("Explain the custom quote in the decision note.")
        annual = float(data["custom_annual"])
        tier = f"{tier} · negotiated"
    workshop = (500000 if market == "SL" else 1667) if data.get("workshop") else 0
    coaching = (450000 if market == "SL" else 1500) * data.get("coaching_quarters", 0)
    return {
        "source": "beyond_pitch_pricing.pdf · 2026",
        "market": market,
        "employees": count,
        "tier": tier,
        "currency": "LKR" if market == "SL" else "USD",
        "annual_licence": annual,
        "workshop_one_time": workshop,
        "coaching_quarters": data.get("coaching_quarters", 0),
        "coaching_total": coaching,
        "first_year_total": annual + workshop + coaching if annual is not None else None,
        "requires_custom_quote": annual is None,
        "billing": "Annual licence. Estimate only; no payment collected.",
        "nature_adjustment": "No industry multiplier is specified in the supplied pricing.",
    }
