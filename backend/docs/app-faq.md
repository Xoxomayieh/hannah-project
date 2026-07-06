# HAULR - Application Frequently Asked Questions (FAQ)

## How do I plan a trip?
To plan a trip, you can use the Dispatch Panel on the home page or talk directly to the AI copilot ("Rig") in the chat dock.
- **Using the Dispatch Panel:** Enter your current location, pickup location, dropoff location, and the current hours used on your 70-hour/8-day cycle. Then click "Plan My Haul".
- **Using the AI Copilot:** You can describe your trip in plain English. For example, say: "Plan me a run from Dallas to Chicago, pickup in Tulsa, 22 hours on my cycle." Rig will extract the details, present a confirmation card, and update the main app interface with the route, compliance gauges, and logs.

## What Hours of Service (HOS) rules does HAULR enforce?
HAULR's compliance engine enforces four primary HOS rules for property-carrying commercial drivers under 49 CFR Part 395:
1. **11-Hour Driving Limit (§395.3(a)(3)):** A driver may drive a maximum of 11 hours after 10 consecutive hours off duty.
2. **14-Hour On-Duty Window (§395.3(a)(2)):** A driver may not drive after the 14th consecutive hour after coming on duty following 10 consecutive hours off duty. Off-duty time does not extend this 14-hour clock.
3. **30-Minute Break (§395.3(a)(3)(ii)):** Driving is not permitted if more than 8 hours have passed since the driver's last off-duty or sleeper berth break of at least 30 minutes.
4. **70-Hour / 8-Day Rolling Cycle (§395.3(b)):** A driver may not drive after accumulating 70 hours of on-duty time in any rolling period of 8 consecutive days.

## How do I reset my HOS clocks?
- **Daily Clocks (11-Hour and 14-Hour):** Taking 10 consecutive hours off-duty (or sleeper berth) resets the 11-hour driving and 14-hour on-duty clocks.
- **Cycle Clock (70-Hour limit):** Accumulating 34 consecutive hours off-duty (or in sleeper berth) triggers a 34-hour restart, which resets the 70-hour rolling cycle to 0 hours used.

## How can I download my driver's daily logs?
After planning a trip, navigate to the "ELD Logs" section. You can browse through each day's log sheet using the day tabs. To download the complete multi-day log packet as a PDF, click the **"Download logs (PDF)"** button. Alternatively, you can ask Rig: "Can you export my logs to PDF?" or "Download my PDF," and Rig will provide a signed download link.

## How are fuel stops and resets automatically placed?
HAULR's HOS Engine simulates your entire route and automatically places events when constraints are met:
- **Pre-trip inspection:** A 30-minute On Duty (Not Driving) pre-trip inspection is scheduled at the start of each duty shift.
- **30-minute break:** Placed before reaching 8 hours of cumulative driving since the last break.
- **Fuel stops:** A 30-minute On Duty (Not Driving) fuel stop is automatically scheduled at least once every 1,000 miles.
- **10-hour rest breaks:** Scheduled when either the 11-hour driving limit or 14-hour on-duty window is reached.
- **34-hour restart:** Scheduled if the 70-hour rolling cycle is exhausted and would otherwise prevent the trip from continuing.

## Why does planning show an error?
Ensure the Django backend API is running. If a location cannot be geocoded, check for typos. Use standard "City, State" formats (e.g., "Dallas, TX" or "Chicago, IL") for best results.
