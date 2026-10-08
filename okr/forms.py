from django import forms

from .models import ActionItem, CheckIn, Cycle, KeyResult, Kpi, Line, LineCyclePlan, Objective

FIELD_CLASS = (
    "w-full bg-cntxt-dark border border-cntxt-border rounded-lg px-3 py-2 text-sm "
    "text-cntxt-text focus:border-cntxt-gold focus:outline-none"
)


def _style(fields):
    widget_attrs = {"class": FIELD_CLASS}
    for f in fields.values():
        existing = f.widget.attrs.get("class", "")
        f.widget.attrs.update(widget_attrs)
        if existing:
            f.widget.attrs["class"] = f"{existing} {FIELD_CLASS}"


class ObjectiveForm(forms.ModelForm):
    class Meta:
        model = Objective
        fields = ["code", "title", "description", "owner_label", "order"]
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, line_cycle_plan=None, **kwargs):
        super().__init__(*args, **kwargs)
        _style(self.fields)


class KeyResultForm(forms.ModelForm):
    class Meta:
        model = KeyResult
        fields = ["tag_label", "text", "extra_note", "order"]
        widgets = {
            "text": forms.Textarea(attrs={"rows": 2}),
            "extra_note": forms.Textarea(attrs={"rows": 2}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _style(self.fields)


class KpiForm(forms.ModelForm):
    class Meta:
        model = Kpi
        fields = ["name", "baseline", "target", "unit", "order"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _style(self.fields)


class CheckInForm(forms.ModelForm):
    class Meta:
        model = CheckIn
        fields = ["value", "note"]
        widgets = {
            "note": forms.TextInput(attrs={"placeholder": "Nota del avance (opcional)"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _style(self.fields)


class ActionItemForm(forms.ModelForm):
    class Meta:
        model = ActionItem
        fields = ["text", "order"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _style(self.fields)


class LineForm(forms.ModelForm):
    class Meta:
        model = Line
        fields = ["code", "name", "full_name", "color_hex", "order"]
        widgets = {
            "color_hex": forms.TextInput(attrs={"type": "color", "class": "h-10 w-16 p-1 bg-cntxt-dark border border-cntxt-border rounded-lg"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _style(self.fields)
        self.fields["color_hex"].widget.attrs["class"] = "h-10 w-16 p-1 bg-cntxt-dark border border-cntxt-border rounded-lg"


class LineCyclePlanForm(forms.ModelForm):
    class Meta:
        model = LineCyclePlan
        fields = ["status", "lead_label", "summary_text"]
        widgets = {
            "summary_text": forms.Textarea(attrs={"rows": 5}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _style(self.fields)


class CycleForm(forms.ModelForm):
    duplicate_from = forms.ModelChoiceField(
        queryset=Cycle.objects.all(), required=False,
        label="Duplicar desde",
        help_text="Clona líneas, objetivos, KRs y KPIs de este ciclo (progreso en 0).",
    )

    class Meta:
        model = Cycle
        fields = ["name", "starts_on", "ends_on", "is_active", "duplicate_from"]
        widgets = {
            "starts_on": forms.DateInput(attrs={"type": "date"}),
            "ends_on": forms.DateInput(attrs={"type": "date"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _style(self.fields)
        self.fields["is_active"].widget.attrs["class"] = "rounded border-cntxt-border"


class CycleEditForm(forms.ModelForm):
    class Meta:
        model = Cycle
        fields = ["name", "starts_on", "ends_on", "is_active"]
        widgets = {
            "starts_on": forms.DateInput(attrs={"type": "date"}),
            "ends_on": forms.DateInput(attrs={"type": "date"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _style(self.fields)
        self.fields["is_active"].widget.attrs["class"] = "rounded border-cntxt-border"
