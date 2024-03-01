import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import axios from "axios";
import yaml from "js-yaml";

type Proxy = {
  name: string;
  type: string;
  server: string;
  port: number;
  password: string;
  sni?: string;
};

type ProxyGroup = {
  name: string;
  type: string;
  proxies: string[];
};

type Rule = string;

interface ClashConfig {
  port: number;
  "socks-port": number;
  "redir-port": number;
  "allow-lan": boolean;
  mode: string;
  "log-level": string;
  "external-controller": string;
  secret: string;
  proxies: Proxy[];
  "proxy-groups": ProxyGroup[];
  rules: Rule[];
}
export const ruleRouter = createTRPCRouter({
  getProxyGroups: publicProcedure
    .input(z.object({ url: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { url } = input;
      const response = await axios.get(url);
      const config = yaml.load(response.data as string) as ClashConfig;
      const proxyGroupsName = config["proxy-groups"].map((group) => group.name);
      return [...proxyGroupsName, "DIRECT", "REJECT"];
    }),
  getRule: publicProcedure
    .input(z.object({ id: z.number().min(1) }))
    .query(async ({ ctx, input }) => {
      const id = input.id;
      const rule = await ctx.db.rule.findFirst({
        where: { id },
        include: {
          items: true,
        },
      });
      return rule;
    }),
  // 添加新规则
  createRule: publicProcedure
    .input(
      z.object({
        url: z.string().min(1),
        items: z.array(
          z.object({
            value: z.string().min(1),
            type: z.string().min(1),
            policy: z.string().min(1),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.rule.create({
        data: {
          url: input.url,
          // 对每个 input.items 创建一个 Item
          items: {
            create: input.items.map((item) => ({
              value: item.value,
              type: item.type,
              policy: item.policy,
            })),
          },
        },
        include: {
          items: true, // 确保返回值中包含 items 数据
        },
      });
    }),

  updateRule: publicProcedure
    .input(
      z.object({
        id: z.number().min(1), // 规则的 ID
        url: z.string().optional(), // 更新的 URL，可选
        items: z
          .array(
            // 更新的项，可选
            z.object({
              id: z.number().optional(), // 项的 ID，对于新项可不提供
              value: z.string().min(1),
              type: z.string().min(1),
              policy: z.string().min(1),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, url, items } = input;

      // 使用事务同时处理规则的 URL 更新、删除和 upsert 操作
      await ctx.db.$transaction(async (prisma) => {
        // 步骤 1: 更新规则的 URL
        if (url !== undefined) {
          await prisma.rule.update({
            where: { id },
            data: { url },
          });
        }

        // 步骤 2: 查询现有项
        const existingItems = await prisma.item.findMany({
          where: { ruleId: id },
        });

        // 步骤 3: 分类需要保留和删除的项
        const existingItemIds = existingItems.map((item) => item.id);
        const inputItemIds = items
          ?.map((item) => item.id)
          .filter((id) => id !== undefined) as number[];
        const idsToDelete = existingItemIds.filter(
          (id) => !inputItemIds.includes(id),
        );

        // 步骤 4: 删除未提及的项
        await prisma.item.deleteMany({
          where: {
            id: { in: idsToDelete },
          },
        });

        // 步骤 5: 对每个提供的项执行 upsert 操作
        await Promise.all(
          items!.map(async (item) => {
            return prisma.item.upsert({
              where: { id: item.id ? item.id : 0 }, // 如果 item.id 不存在，使用一个不可能的值作为占位符
              update: {
                value: item.value,
                type: item.type,
                policy: item.policy,
              },
              create: {
                ruleId: id, // 确保在创建时关联到正确的规则
                value: item.value,
                type: item.type,
                policy: item.policy,
              },
            });
          }),
        );
      });
    }),

  // 获取所有规则
  getAllRules: publicProcedure.query(async ({ ctx }) => {
    const rules = await ctx.db.rule.findMany({
      include: {
        items: true, // 包括关联的 items
      },
      orderBy: {
        createdAt: "desc", // 假设你的 Rule 模型中有 createdAt 字段
      },
    });
    return rules;
  }),
  generateClashConfig: publicProcedure
    .input(
      z.object({
        id: z.number().min(1), // 规则的 ID
      }),
    )
    .query(async ({ ctx, input }) => {
      const id = input.id;
      const rule = await ctx.db.rule.findFirst({
        where: { id },
        include: {
          items: true,
        },
      });
      const { data } = await axios.get(rule!.url, { responseType: "text" });
      const originConfig = yaml.load(data) as ClashConfig;
      const newRules = rule!.items.map(
        (item) => `${item.type},${item.value},${item.policy}`,
      );
      const newConfig = {
        ...originConfig,
        rules: [...newRules, ...originConfig.rules],
      };
      const fileContent = yaml.dump(newConfig);
      return fileContent;
    }),
});
