from django.urls import path
from .views import UploadView, SessionView, ExplainView, GraphListView, SaveView

urlpatterns = [
    path('upload/',                       UploadView.as_view(),   name='upload'),
    path('session/',                      SessionView.as_view(),  name='session'),
    path('explain/',                      ExplainView.as_view(),  name='explain'),
    path('graphs/',                       GraphListView.as_view(), name='graphs'),
    path('graphs/<str:session_id>/save/', SaveView.as_view(),     name='save'),
]
