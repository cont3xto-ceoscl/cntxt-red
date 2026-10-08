from django.contrib import admin

from .models import ActionItem, CheckIn, Cycle, KeyResult, Kpi, Line, LineCyclePlan, Objective


@admin.register(Line)
class LineAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "color_hex", "order"]
    ordering = ["order"]


@admin.register(Cycle)
class CycleAdmin(admin.ModelAdmin):
    list_display = ["name", "starts_on", "ends_on", "is_active"]
    list_editable = ["is_active"]


class ObjectiveInline(admin.TabularInline):
    model = Objective
    extra = 0
    fields = ["code", "title", "weight", "priority", "is_backlog", "order"]


@admin.register(LineCyclePlan)
class LineCyclePlanAdmin(admin.ModelAdmin):
    list_display = ["line", "cycle", "status"]
    list_filter = ["cycle", "status"]
    inlines = [ObjectiveInline]


class KeyResultInline(admin.TabularInline):
    model = KeyResult
    extra = 0
    fields = ["tag_label", "text", "weight", "evolution_tag", "confidence", "order"]


@admin.register(Objective)
class ObjectiveAdmin(admin.ModelAdmin):
    list_display = ["code", "title", "line_cycle_plan", "weight", "priority", "is_backlog", "pct"]
    list_filter = ["line_cycle_plan__cycle", "line_cycle_plan__line", "priority", "is_backlog"]
    inlines = [KeyResultInline]

    @admin.display(description="%")
    def pct(self, obj):
        return f"{obj.pct}%"


class ActionItemInline(admin.TabularInline):
    model = ActionItem
    extra = 0


class KpiInline(admin.TabularInline):
    model = Kpi
    extra = 0
    fields = ["name", "target", "unit", "order"]


@admin.register(KeyResult)
class KeyResultAdmin(admin.ModelAdmin):
    list_display = ["tag_label", "objective", "weight", "confidence", "pct"]
    list_filter = ["objective__line_cycle_plan__cycle", "confidence"]
    inlines = [KpiInline, ActionItemInline]

    @admin.display(description="%")
    def pct(self, obj):
        return f"{obj.pct}%"


class CheckInInline(admin.TabularInline):
    model = CheckIn
    extra = 0
    readonly_fields = ["created_at"]


@admin.register(Kpi)
class KpiAdmin(admin.ModelAdmin):
    list_display = ["name", "key_result", "current", "target", "pct"]
    inlines = [CheckInInline]

    @admin.display(description="%")
    def pct(self, obj):
        return f"{obj.pct}%"


@admin.register(CheckIn)
class CheckInAdmin(admin.ModelAdmin):
    list_display = ["kpi", "value", "created_at", "created_by"]
    list_filter = ["kpi__key_result__objective__line_cycle_plan__line"]
    date_hierarchy = "created_at"
