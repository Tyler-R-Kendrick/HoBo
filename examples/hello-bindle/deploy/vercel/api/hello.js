// hello-bindle API (HoBo example), realized as a Vercel Node function.
// Mirrors examples/hello-bindle/src/api.ts: GET /hello?name= -> { message: "hello, <name>" }
// with the same parse-boundary default ("world").
export default function handler(req, res) {
	const raw = (req.query && req.query.name) || "";
	const name = String(raw).trim() || "world";
	res.setHeader("content-type", "application/json");
	res.status(200).json({ message: `hello, ${name}` });
}
