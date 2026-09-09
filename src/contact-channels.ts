import type {
  CompanyContactBusinessRole,
  CompanyContactChannel,
} from "./types.js";

const ROLE_RANK: Record<CompanyContactBusinessRole, number> = {
  unknown: 0,
  general: 1,
  support: 2,
  procurement: 3,
  "business-development": 4,
  wholesale: 5,
  export: 6,
  sales: 7,
};

export function inferCompanyContactBusinessRole(value: string): CompanyContactBusinessRole {
  const normalized = String(value || "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}@._+\-/]+/gu, " ");
  const localPart = normalized.includes("@") ? normalized.split("@")[0] || "" : "";
  const signal = `${localPart} ${normalized}`;

  if (/(?:^|[._+\-/\s])(sales?|commercial|orders?)(?:$|[._+\-/\s])/u.test(signal)) return "sales";
  if (/(?:^|[._+\-/\s])(export|international|overseas)(?:$|[._+\-/\s])/u.test(signal)) return "export";
  if (/(?:^|[._+\-/\s])(wholesale|distributor|distribution|dealer)(?:$|[._+\-/\s])/u.test(signal)) return "wholesale";
  if (/(?:^|[._+\-/\s])(support|service|help|care)(?:$|[._+\-/\s])/u.test(signal)) return "support";
  if (/(?:^|[._+\-/\s])(procurement|purchasing|purchase|sourcing|buyer)(?:$|[._+\-/\s])/u.test(signal)) return "procurement";
  if (/(?:^|[._+\-/\s])(bizdev|business[._+\-/\s-]*development|partnerships?|partners?|alliances?)(?:$|[._+\-/\s])/u.test(signal)) {
    return "business-development";
  }
  if (/(?:^|[._+\-/\s])(info|contact|hello|inquir(?:y|ies)|enquir(?:y|ies)|office|admin|business)(?:$|[._+\-/\s])/u.test(signal)) {
    return "general";
  }
  return "unknown";
}

export function mergeCompanyContactChannels(
  channels: readonly CompanyContactChannel[],
  maxItems = 40,
): CompanyContactChannel[] {
  const byEndpoint = new Map<string, CompanyContactChannel>();
  for (const raw of channels) {
    const normalized = normalizeCompanyContactChannel(raw);
    if (!normalized) continue;
    const key = companyContactChannelKey(normalized);
    const existing = byEndpoint.get(key);
    if (!existing) {
      byEndpoint.set(key, normalized);
      continue;
    }
    byEndpoint.set(key, preferCompanyContactChannel(existing, normalized));
  }
  return [...byEndpoint.values()]
    .sort((a, b) => channelSortRank(b) - channelSortRank(a) || companyContactChannelKey(a).localeCompare(companyContactChannelKey(b)))
    .slice(0, Math.max(1, Math.min(100, maxItems)));
}

function normalizeCompanyContactChannel(channel: CompanyContactChannel): CompanyContactChannel | null {
  const value = String(channel.value || "").trim().slice(0, 1_000);
  const url = String(channel.url || "").trim().slice(0, 1_000);
  const sourcePageUrl = String(channel.sourcePageUrl || "").trim().slice(0, 1_000);
  if (!value || !sourcePageUrl) return null;
  return {
    ...channel,
    value,
    ...(url ? { url } : {}),
    sourcePageUrl,
  };
}

function companyContactChannelKey(channel: CompanyContactChannel): string {
  const endpoint = (channel.url || channel.value).trim().toLocaleLowerCase("en-US");
  return `${channel.type}:${endpoint}`;
}

function preferCompanyContactChannel(a: CompanyContactChannel, b: CompanyContactChannel): CompanyContactChannel {
  const aRank = channelSortRank(a);
  const bRank = channelSortRank(b);
  if (bRank > aRank) return b;
  if (aRank > bRank) return a;
  if (ROLE_RANK[b.businessRole] > ROLE_RANK[a.businessRole]) return b;
  return a;
}

function channelSortRank(channel: CompanyContactChannel): number {
  const verification = channel.verificationStatus === "official-site-structured" ? 40 : 30;
  const confidence = channel.confidence === "high" ? 20 : 10;
  const role = ROLE_RANK[channel.businessRole] || 0;
  const type = channel.type === "email" ? 8
    : channel.type === "whatsapp-business" ? 7
      : channel.type === "contact-form" ? 6
        : channel.type === "contact-page" ? 5
          : channel.type === "phone" ? 4
            : channel.type === "linkedin-company" ? 3
              : 2;
  return verification + confidence + role + type;
}
