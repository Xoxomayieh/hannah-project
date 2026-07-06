# HAULR — Loom Demo Script (3–5 min)

**Goal:** Walk through the app and the code for the Full-Stack Developer Assessment.
**Tone:** Calm, friendly, simple English. Speak at a normal pace (~150 words/min).
**Example inputs used the whole way through:** Current = **Los Angeles, CA**, Pickup = **Phoenix, AZ**, Dropoff = **Dallas, TX**, Cycle used = **10 hours**. (Type these in fresh on camera — clear the pre-filled defaults first so it's clearly a live test.)

Tip: `[SCREEN]` lines tell you what to show. The plain lines are what you say.

---

## 1. Intro (about 20 seconds)

[SCREEN: the live site's hero / landing page]

"Hi, I'm going to show you HAULR — a full-stack app I built for this assessment.

It's a trip planner for truck drivers. You give it a trip, and it does two things: it draws the route on a map, and it fills out the driver's daily ELD log sheets — the same paper logs drivers use by law.

It's built with **Django and React**, and it's hosted live. Let me show you how it works."

---

## 2. The inputs (about 40 seconds)

[SCREEN: scroll to the "Plan My Haul" form]

"The app asks for four simple inputs, exactly like the assessment says. I'll clear the fields and type a fresh trip:

- Current location — **Los Angeles, CA**
- Pickup location — **Phoenix, AZ**
- Dropoff location — **Dallas, TX**
- And current cycle used — I'll set that to **10 hours** using this circular dial

As I type each location, you can see a dropdown suggests real places. That comes from a free geocoding service, so drivers pick a real address, not a guess. And the cycle hours are set with this round dial, so it feels less like a form and more like a dashboard.

Now I'll click **Plan My Haul**."

[SCREEN: click "Plan My Haul", let the transition play into the results]

---

## 3. The results screen — summary + duty timeline (about 30 seconds)

[SCREEN: the full results view after it loads — pan across the top, don't jump straight to the map]

"When I hit plan, the whole screen turns into the trip result. Let me walk across it, because there's more here than just a map.

At the top, four quick numbers summarize the haul: total **driving hours**, total **on-duty hours**, how many **calendar days** it takes, and the total number of **stops** — that's fuel stops, breaks, and rests added together. If the trip is long enough to need a 34-hour restart, it even shows a little badge up here.

Right under that is the **duty-status timeline** — this colored bar. Each color is a status: off duty, sleeper berth, driving, and on duty. So in one glance you can see how the driver's time is split across the whole trip."

---

## 4. The event timeline and the map (about 40 seconds)

[SCREEN: point to the left timeline list first, scroll it, then to the map on the right]

"Below that, the screen is split in two.

On the **left** is the event timeline — a step-by-step list of everything that happens on the trip, in order. Each row is one event: the pickup, driving legs, the 30-minute break, fuel stops, the 10-hour rest, and the dropoff — each with its status, how long it lasts, and the day and time it happens. I can scroll through the whole journey right here.

On the **right** is the map. You can see the full route from **Los Angeles** across to **Dallas**, with the **Phoenix** pickup on the way. It's a free map — CARTO's dark style — drawn with Leaflet, and the stops and rests from the timeline show up as pins on the road.

The key thing is these two sides are the same plan: the app follows the real driving rules — 11 hours of driving max, a 14-hour on-duty window, a 30-minute break after 8 hours, and fuel at least every 1,000 miles — so the timeline, the map, and the log sheets all match."

---

## 5. The ELD log sheets (about 40 seconds)

[SCREEN: scroll to the daily log sheets, click through the day tabs]

"Second output, and this is the important one: the daily log sheets.

These are drawn to look just like the real FMCSA paper log. For each day of the trip, the app fills in the grid — off duty, sleeper berth, driving, and on duty — hour by hour.

Because Los Angeles to Dallas is a long trip, it needs **more than one day**, so the app makes **one sheet per day**. You can click each day here.

Every sheet adds up to exactly 24 hours, the totals are calculated for you, and you can **download them as a PDF** to print or send. This is the part the assessment grades for accuracy, so I made sure the math is correct and the logs are honest."

---

## 6. The AI copilot — "Rig" (about 45 seconds)

[SCREEN: open the Rig dock — the floating copilot available on every screen, NOT the small avatar in the results header]

"I also added a real AI copilot called **Rig** — it's this dock that's available on every screen. A driver can just ask questions in plain English.

For example, I can type **'Plan Los Angeles to Dallas, pickup Phoenix, 10 hour cycle'** — and Rig plans the same trip straight from chat, then asks me to confirm before it runs it.

I can also ask rule questions, like **'Explain the 14-hour on-duty rule'** or **'When is a 34-hour restart scheduled?'** — and it answers using the real FMCSA driver's guide, and shows the source it pulled from. For anything outside the guide, it can also search the web.

So it's not making things up — it's grounded in the actual rulebook and the same trip engine the form uses."

---

## 7. The code (about 50 seconds)

[SCREEN: switch to your editor — show the backend folders, then the frontend]

"Quick look at the code.

On the **backend**, it's Django. The heart of it is the HOS engine — that's the part that takes the trip and works out every driving hour, break, rest, and fuel stop. It's plain Python, and I covered it with tests so the log math stays correct. Django then serves it all through a simple JSON API.

On the **frontend**, it's React with TypeScript and Vite. The form, the summary tiles, the duty timeline, the event list, the map, and the log sheets are each their own component. The log sheet is drawn as an SVG, which is how I get that clean, exact paper look and the PDF export.

The Rig copilot uses LangGraph on top of the same trip tools, so chat and the form both plan trips the same, reliable way.

Everything is hosted on Vercel, and the code is on GitHub."

---

## 8. Close (about 15 seconds)

[SCREEN: back to the live app]

"So that's HAULR: four inputs in — like Los Angeles to Dallas — and you get an accurate route map and fully filled-out ELD log sheets out, with a helpful AI copilot on the side.

Thanks for watching. The live link and the GitHub repo are in the description."

---

### Speaker checklist
- Clear the pre-filled defaults, then type the four inputs fresh on camera: **Los Angeles, CA / Phoenix, AZ / Dallas, TX / 10 hrs** (cycle set on the dial).
- Actually click **Plan My Haul** on camera — don't use a pre-loaded result.
- On the results screen, show the **whole** view, not just the map: the 4 summary tiles, the colored **duty-status timeline** bar, the **event timeline list on the left**, then the map on the right.
- **Scroll the left event list** so viewers see it's the full step-by-step journey, not a static box.
- Show at least **two day tabs** on the log sheets to prove multi-day works.
- For the AI demo, use the **Rig dock** (the floating copilot). Do **not** type into the small avatar in the results header — that one only gives canned replies and will look fake on camera.
- In chat, **type** the trip ("Plan Los Angeles to Dallas, pickup Phoenix, 10 hour cycle") so it matches the form demo — don't click the built-in default prompt.
- Total spoken time lands around **4.5 minutes** — inside the 3–5 minute limit.
