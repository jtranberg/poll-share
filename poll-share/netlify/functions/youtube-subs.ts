export default async (req: Request) => {
  const url = new URL(req.url);
  const channelId = url.searchParams.get("channelId") || "UCdlKQfnSA5TvtsxjWq7PGmw";

  const apiKey = process.env.YT_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "Missing YT_API_KEY env var" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const ytUrl =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=statistics,snippet` +
    `&id=${encodeURIComponent(channelId)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  try {
    const r = await fetch(ytUrl);
    if (!r.ok) {
      const text = await r.text();
      return new Response(JSON.stringify({ ok: false, error: "YouTube API error", detail: text }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await r.json();
    const item = data?.items?.[0];

    const subs = item?.statistics?.subscriberCount
      ? Number(item.statistics.subscriberCount)
      : null;

    const hidden = !!item?.statistics?.hiddenSubscriberCount;
    const title = item?.snippet?.title || null;

    // Cache for 30 minutes (saves quota)
    return new Response(
      JSON.stringify({
        ok: true,
        channelId,
        title,
        subscriberCount: subs,
        hiddenSubscriberCount: hidden,
        fetchedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=1800",
        },
      }
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
