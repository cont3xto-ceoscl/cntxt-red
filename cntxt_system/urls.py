"""
URL configuration for cntxt_system project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('core.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += [
        re_path(r'^(?P<path>.*\.(?:css|js|png|jpg|jpeg|jfif|svg|ico|gif|woff2?|ttf|eot|csv|json))$', serve, {'document_root': settings.BASE_DIR}),
    ]
