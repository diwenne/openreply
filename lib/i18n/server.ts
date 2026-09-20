import { cache } from "react";
import { cookies } from "next/headers";
import { createI18n, LOCALE_COOKIE, resolveLocale } from "./index";

export const getI18n = cache(async () => {
  const cookieStore = await cookies();
  return createI18n(resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value));
});
