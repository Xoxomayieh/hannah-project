from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from core.services import geocode_suggest
from .services import run_trip_planning

class LocationSuggestView(APIView):
    def get(self, request):
        query = request.query_params.get('q', '')
        try:
            limit = int(request.query_params.get('limit', 5))
        except ValueError:
            limit = 5
        results = geocode_suggest(query, limit=min(max(limit, 1), 10))
        return Response({"results": results}, status=status.HTTP_200_OK)

class PlanTripView(APIView):
    def post(self, request):
        data = request.data
        current = data.get('current_location')
        pickup = data.get('pickup_location')
        dropoff = data.get('dropoff_location')
        cycle_used = float(data.get('cycle_used_hrs', 0))

        try:
            plan = run_trip_planning(current, pickup, dropoff, cycle_used)
            return Response(plan, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
