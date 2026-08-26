import { NextResponse } from "next/server";
import { saveThemePreference } from "../../actions/theme";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { surface, brand, mode } = body;

    if (!surface || !brand || !mode) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await saveThemePreference(surface, brand, mode);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
