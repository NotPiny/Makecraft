import type { RequestHandler } from "@sveltejs/kit";

const ALLOWED_HOSTS = [
	"edge.forgecdn.net",
	"mediafilez.forgecdn.net",
	"api.curse.tools",
];

function validateTarget(url: URL): Response | null {
	const target = url.searchParams.get("url");
	if (!target) return new Response("Missing url parameter", { status: 400 });

	let parsed: URL;
	try {
		parsed = new URL(target);
	} catch {
		return new Response("Invalid url parameter", { status: 400 });
	}

	if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
		return new Response("Host not allowed", { status: 403 });
	}

	return null;
}

export const GET: RequestHandler = async ({ url }) => {
	const error = validateTarget(url);
	if (error) return error;

	const target = new URL(url.searchParams.get("url")!);
	const response = await fetch(target.toString());

	const headers = new Headers();
	const contentType = response.headers.get("content-type");
	if (contentType) headers.set("content-type", contentType);

	return new Response(response.body, { status: response.status, headers });
};

export const POST: RequestHandler = async ({ url, request }) => {
	const error = validateTarget(url);
	if (error) return error;

	const target = new URL(url.searchParams.get("url")!);
	const body = await request.text();

	const response = await fetch(target.toString(), {
		method: "POST",
		headers: { "Content-Type": request.headers.get("content-type") ?? "application/json" },
		body,
	});

	const headers = new Headers();
	const contentType = response.headers.get("content-type");
	if (contentType) headers.set("content-type", contentType);

	return new Response(response.body, { status: response.status, headers });
};
