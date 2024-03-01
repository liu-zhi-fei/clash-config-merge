import { type NextRequest } from "next/server";
import { api } from "@/trpc/server";

const GET = async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const config = await api.rule.generateClashConfig.query({
    id: parseInt(params.id),
  });

  return new Response(config, {
    headers: {
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Disposition": `attachment; filename="clash-config-${params.id}.yaml"`,
    },
  });
};

export { GET };
