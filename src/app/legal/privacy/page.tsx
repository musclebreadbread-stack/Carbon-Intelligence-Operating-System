import { connection } from "next/server";

import { getDictionary, type DictionaryKey } from "@/lib/i18n/server";

export const metadata = {
  title: "CIOS — 개인정보처리방침",
};

const SECTIONS: readonly DictionaryKey[] = [
  "legal.privacy.section.itemsCollected",
  "legal.privacy.section.purposeOfUse",
  "legal.privacy.section.retentionPeriod",
  "legal.privacy.section.thirdPartyProvision",
  "legal.privacy.section.processingDelegation",
  "legal.privacy.section.userRights",
  "legal.privacy.section.securityMeasures",
  "legal.privacy.section.dpo",
  "legal.privacy.section.notice",
];

export default async function PrivacyPolicyPage() {
  await connection();

  const dict = await getDictionary();

  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">{dict["legal.privacy.title"]}</h1>
      <p className="text-sm text-muted-foreground">{dict["legal.privacy.intro"]}</p>
      {SECTIONS.map((key) => (
        <section key={key} className="space-y-2">
          <h2 className="text-base font-semibold">{dict[key]}</h2>
          <p className="text-sm text-muted-foreground">{dict["legal.placeholder"]}</p>
        </section>
      ))}
    </article>
  );
}
