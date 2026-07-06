from django.db import models

class Trip(models.Model):
    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    cycle_used_hrs = models.FloatField()
    start_time = models.DateTimeField(auto_now_add=True)

class RouteLeg(models.Model):
    trip = models.ForeignKey(Trip, related_name='legs', on_delete=models.CASCADE)
    distance_miles = models.FloatField()
    duration_hours = models.FloatField()
    start_location = models.CharField(max_length=255)
    end_location = models.CharField(max_length=255)

class DutyEvent(models.Model):
    trip = models.ForeignKey(Trip, related_name='events', on_delete=models.CASCADE)
    status = models.CharField(max_length=50)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    location = models.CharField(max_length=255)
    lat = models.FloatField()
    lng = models.FloatField()
    note = models.TextField(blank=True)
