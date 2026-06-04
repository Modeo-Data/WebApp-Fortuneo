from django.urls import path
from .views import UploadView, SessionView, ExplainView, GraphListView, SaveView, GlobalSearchView, CatalogImportView, CatalogNodesView, CatalogGraphView, ClearAllView

urlpatterns = [
    path('upload/',                       UploadView.as_view(),      name='upload'),
    path('session/',                      SessionView.as_view(),     name='session'),
    path('explain/',                      ExplainView.as_view(),     name='explain'),
    path('graphs/',                       GraphListView.as_view(),   name='graphs'),
    path('graphs/<str:session_id>/save/', SaveView.as_view(),        name='save'),
    path('search/',                       GlobalSearchView.as_view(), name='search'),
    path('catalog/import/',               CatalogImportView.as_view(), name='catalog-import'),
    path('catalog/nodes/',                CatalogNodesView.as_view(),  name='catalog-nodes'),
    path('catalog/graph/',                CatalogGraphView.as_view(),  name='catalog-graph'),
    path('clear/',                        ClearAllView.as_view(),      name='clear-all'),
]
