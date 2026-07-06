from django.urls import path
from .views import PlanTripView, LocationSuggestView

urlpatterns = [
    path('plan/', PlanTripView.as_view(), name='plan-trip'),
    path('suggest/', LocationSuggestView.as_view(), name='suggest-location'),
]
