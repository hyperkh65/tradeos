import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';

const CARRIERS: Record<string, { name: string; trackingUrl: (bl: string) => string }> = {
  EGLV: { name: 'Evergreen Line', trackingUrl: bl => `https://www.evergreen-line.com/ebusiness/tracking.do?bl_no=${bl}` },
  MSCU: { name: 'MSC', trackingUrl: bl => `https://www.msc.com/track-a-shipment?bl=${bl}` },
  HLCU: { name: 'Hapag-Lloyd', trackingUrl: bl => `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${bl}` },
  COSU: { name: 'COSCO Shipping', trackingUrl: bl => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=BL&number=${bl}` },
  MAEU: { name: 'Maersk', trackingUrl: bl => `https://www.maersk.com/tracking/${bl}` },
  MSKU: { name: 'Maersk', trackingUrl: bl => `https://www.maersk.com/tracking/${bl}` },
  YMLU: { name: 'Yang Ming', trackingUrl: () => 'https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx' },
  APLU: { name: 'APL / CMA CGM', trackingUrl: bl => `https://www.apl.com/ebusiness/tracking?trackingNum=${bl}` },
  CMDU: { name: 'CMA CGM', trackingUrl: bl => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=BillOfLading&Reference=${bl}` },
  HDMU: { name: 'HMM', trackingUrl: bl => `https://www.hmm21.com/e-service/cargo/cargoTracking.do?blNo=${bl}` },
  HMMU: { name: 'HMM', trackingUrl: bl => `https://www.hmm21.com/e-service/cargo/cargoTracking.do?blNo=${bl}` },
  OOLU: { name: 'OOCL', trackingUrl: bl => `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?bno=${bl}` },
  PCIU: { name: 'Pan Ocean', trackingUrl: bl => `https://www.panocean.com/en/e-service/tracking.do?blNo=${bl}` },
  WHLC: { name: 'Wan Hai Lines', trackingUrl: bl => `https://www.wanhai.com/views/Tracking/CargoTracking.xhtml?bl=${bl}` },
  ZIMU: { name: 'ZIM', trackingUrl: bl => `https://www.zim.com/tools/track-a-shipment?consnr=${bl}` },
  KMTC: { name: 'KMTC', trackingUrl: bl => `https://www.kmtc.co.kr/tracking?blNo=${bl}` },
  SITC: { name: 'SITC', trackingUrl: () => 'https://www.sitcline.com/en/track' },
};

function getShip24Key(): string {
  if (process.env.SHIP24_API_KEY) return process.env.SHIP24_API_KEY;
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('company') as { value: string } | undefined;
    if (row) {
      const saved = JSON.parse(row.value);
      if (saved.ship24ApiKey) return saved.ship24ApiKey;
    }
  } catch { /* ignore */ }
  return '';
}

export async function GET(req: NextRequest) {
  const bl = req.nextUrl.searchParams.get('bl')?.trim().toUpperCase() || '';
  if (!bl || bl.length < 4) return NextResponse.json({ error: 'B/L 번호 필요' }, { status: 400 });

  const scac = bl.slice(0, 4);
  const carrier = CARRIERS[scac] || null;

  const result: Record<string, unknown> = {
    bl,
    scac,
    carrierName: carrier?.name || null,
    trackingUrl: carrier?.trackingUrl(bl) || null,
    source: null,
  };

  const apiKey = getShip24Key();

  // ── Ship24 (full auto-tracking) ────────────────────────────────────────────
  if (apiKey) {
    try {
      const ship24Res = await fetch('https://api.ship24.com/public/v1/trackers', {
        method: 'POST',
        headers: {
          'Authorization': `Apic-Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trackingNumber: bl }),
        signal: AbortSignal.timeout(10000),
      });

      if (ship24Res.ok) {
        const data = await ship24Res.json();
        const tracker = data?.data?.tracker;

        if (tracker) {
          result.trackerId = tracker.trackerId;
          const shipment = tracker.shipment;

          if (shipment) {
            result.vessel = shipment.vessel?.name || null;
            result.voyage = shipment.voyage || null;
            result.pol = shipment.pol?.location?.locationCode || null;
            result.pod = shipment.pod?.location?.locationCode || null;
            result.etd = shipment.etd ? String(shipment.etd).slice(0, 10) : null;
            result.eta = shipment.estimatedTimeOfArrival
              ? String(shipment.estimatedTimeOfArrival).slice(0, 10) : null;
            result.statusMilestone = shipment.statusMilestone || null;
          }

          // Latest tracking events (for timeline)
          const events = (tracker.events || []).slice(0, 8);
          result.events = events.map((e: Record<string, unknown>) => ({
            date: e.occurrenceDatetime,
            location: (e.location as Record<string, unknown>)?.locationName || '',
            status: e.statusCode,
            desc: e.description,
          }));

          result.source = 'ship24';
          result.carrierName = result.carrierName || carrier?.name || null;
        }
      } else {
        const errText = await ship24Res.text();
        result.ship24Error = `Ship24 ${ship24Res.status}: ${errText.slice(0, 200)}`;
      }
    } catch (e) {
      result.ship24Error = String(e);
    }
  } else {
    result.ship24Missing = true;

    // Fallback: try Searates free endpoint
    try {
      const sRes = await fetch(
        `https://tracking.searates.com/api/tracking?number=${encodeURIComponent(bl)}&type=BL`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
      );
      if (sRes.ok) {
        const d = await sRes.json();
        if (d?.data) {
          result.vessel = d.data.vessel || null;
          result.voyage = d.data.voyage || null;
          result.pol = d.data.pol || null;
          result.pod = d.data.pod || null;
          result.etd = d.data.etd ? String(d.data.etd).slice(0, 10) : null;
          result.eta = d.data.eta ? String(d.data.eta).slice(0, 10) : null;
          result.source = 'searates';
        }
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json(result);
}
