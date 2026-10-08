from django.contrib.auth import views as auth_views
"""
URL configuration for cntxt_system project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve

def healthz(request):
    """Health check endpoint para EasyPanel y uptime monitoring."""
    return HttpResponse("ok")

urlpatterns = [
    path('healthz/', healthz, name='healthz'),
    path('login/', auth_views.LoginView.as_view(template_name='okr/login.html'), name='login'),
    path('accounts/login/', RedirectView.as_view(url='/login/', permanent=False)),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
    path('admin/', admin.site.urls),
    path('okr/', include('okr.urls')),
    path('', include('core.urls')),
]

# Media and static file routing (including tasks assets)
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
urlpatterns += [
    re_path(r'^(?:red/|neo/|NEO/|tasks/)?(?P<path>.*\.(?:css|js|png|jpg|jpeg|jfif|svg|ico|gif|woff2?|ttf|eot|otf|csv|json))$', serve, {'document_root': settings.BASE_DIR}),
]
