from django.conf import settings

def hub_url(request):
    return {"HUB_URL": getattr(settings, 'HUB_URL', '/')}

def view_mode(request):
    mode = request.session.get("view_mode", "ceo")
    return {"view_mode": mode}
