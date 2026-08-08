import { connection } from "next/server";

import { getDictionary, type DictionaryKey } from "@/lib/i18n/server";

export const metadata = {
  title: "CIOS — 이용약관",
};

const SECTIONS: readonly DictionaryKey[] = [
  "legal.terms.section.purpose",
  "legal.terms.section.definitions",
  "legal.terms.section.serviceProvision",
  "legal.terms.section.contractFormation",
  "legal.terms.section.billing",
  "legal.terms.section.userObligations",
  "legal.terms.section.restrictionTermination",
  "legal.terms.section.disclaimer",
  "legal.terms.section.disputeResolution",
];

export default async function TermsOfServicePage() {
  await connection();

  const dict = await getDictionary();

  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">{dict["legal.terms.title"]}</h1>
      <p className="text-sm text-muted-foreground">{dict["legal.terms.intro"]}</p>
      {SECTIONS.map((key) => (
        <section key={key} className="space-y-2">
          <h2 className="text-base font-semibold">{dict[key]}</h2>
          <p className="text-sm text-muted-foreground">{dict["legal.placeholder"]}</p>
        </section>
      ))}
    </article>
  );
}
