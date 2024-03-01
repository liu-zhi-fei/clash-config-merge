"use client";
import { unstable_noStore as noStore } from "next/cache";
import { api } from "@/trpc/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectContent } from "@radix-ui/react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { type SubmitHandler, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";

const RULES = [
  {
    type: "DOMAIN-SUFFIX",
    value: "example.com",
    policy: "DIRECT",
    description: "直连example.com域名后缀",
  },
  {
    type: "DOMAIN-KEYWORD",
    value: "keyword",
    policy: "Proxy",
    description: "含有keyword关键词的域名使用Proxy策略",
  },
  {
    type: "IP-CIDR",
    value: "192.168.1.0/24",
    policy: "DIRECT",
    description: "直连192.168.1.0/24内的IP地址",
  },
  {
    type: "GEOIP",
    value: "CN",
    policy: "DIRECT",
    description: "地理位置在中国的IP地址直连",
  },
  {
    type: "MATCH",
    value: "",
    policy: "Proxy",
    description: "默认规则，未匹配任何规则的流量使用Proxy策略",
  },
];

export type Rule = {
  type: string;
  value: string;
  policy: string;
  description: string;
  id: number;
};

const emptyRule: Rule = {
  type: "DOMAIN-KEYWORD",
  value: "",
  policy: "DIRECT",
  description: "",
  id: 0,
};

const itemSchema = z.object({
  url: z.string().min(1, "Value is required"),
  id: z.number(),
  items: z.array(
    z.object({
      id: z.number(),
      value: z.string().min(1, "Value is required"),
      type: z.string().min(1, "Value is required"),
      policy: z.string().min(1, "Value is required"),
    }),
  ),
});

type FormData = z.infer<typeof itemSchema>;

export default function Home() {
  noStore();
  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    resolver: zodResolver(itemSchema),
    defaultValues: {
      url: "",
      items: [{ ...emptyRule }],
    },
  });
  const { append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const { items: rules, url, id: i } = form.getValues();
  const id = parseInt(String(i), 10);

  const classConfig = api.rule.getRule.useQuery({ id }, { enabled: false });
  const groupsQuery = api.rule.getProxyGroups.useQuery(
    { url: (url || classConfig.data?.url) ?? "" },
    {
      enabled: !!classConfig.data?.url,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  );
  const { mutateAsync: addRule } = api.rule.createRule.useMutation();
  const { mutateAsync: updateRule } = api.rule.updateRule.useMutation();
  const { toast } = useToast();
  const onAddRule = () => {
    append({ ...emptyRule });
  };
  const onSubmit: SubmitHandler<FormData> = async (data: FormData) => {
    if (id) {
      await updateRule({ id, items: data.items, url: data.url });
    } else {
      const rule = await addRule({ url: data.url, items: data.items });
      form.reset({
        id: rule.id,
        url: rule.url,
        items: rule.items,
      });
    }
    toast({
      title: "You submitted the following values:",
      description: (
        <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
          <code className="text-white">{JSON.stringify(data, null, 2)}</code>
        </pre>
      ),
    });
  };
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div>
          <h1 className="text-4xl font-bold text-white">class 配置自定义</h1>
          <div className={cn("my-2 flex w-[600px] xl:w-1/2")}>
            <FormField
              control={form.control}
              name={"id"}
              render={({ field }) => (
                <FormItem className={cn("w-[100%]")}>
                  <FormControl>
                    <Input
                      type={"text"}
                      className={cn("mr-2 text-black")}
                      placeholder={"请输入配置ID / 或者保存后生成ID"}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              type={"button"}
              disabled={classConfig.isFetching && groupsQuery.isFetching}
              className={cn("mx-2")}
              variant={"secondary"}
              onClick={async () => {
                const config = await classConfig.refetch();
                if (config.data) {
                  form.reset({
                    id: config.data.id,
                    url: config.data.url,
                    items: config.data.items,
                  });
                }
                toast({
                  title: "获取已有配置",
                  description: "获取已有配置成功",
                });
              }}
            >
              获取已有配置
            </Button>
          </div>
          <div className={cn("flex w-[600px] xl:w-1/2")}>
            <FormField
              control={form.control}
              name={`url`}
              render={({ field }) => (
                <FormItem className={cn("w-[100%]")}>
                  <FormControl>
                    <Input
                      type={"text"}
                      className={cn("mr-2 text-black")}
                      placeholder={"请输入配置文件地址"}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              type={"button"}
              disabled={groupsQuery.isFetching}
              className={cn("mx-2")}
              variant={"secondary"}
              onClick={async () => {
                await groupsQuery.refetch();
                toast({
                  title: "获取配置文件",
                  description: "获取配置文件成功",
                });
              }}
            >
              获取配置文件
            </Button>
          </div>
          <div>
            {groupsQuery.data ? (
              <div>
                <h2>自定义配置</h2>
                <div>
                  {rules.map((rule, index) => (
                    <div key={index} className={cn("my-2 flex")}>
                      <FormField
                        control={form.control}
                        name={`items.${index}.type`}
                        render={({ field }) => (
                          <FormItem>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger
                                  className={cn(
                                    "w-[180px] bg-black text-white",
                                  )}
                                >
                                  <SelectValue placeholder="Select a Type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent
                                className={cn("w-[180px] bg-black")}
                              >
                                <SelectGroup>
                                  {RULES.map((rule) => (
                                    <SelectItem
                                      value={rule.type}
                                      key={rule.type}
                                    >
                                      {rule.type}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.value`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type={"text"}
                                className={cn("mx-2 w-52 text-black")}
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.policy`}
                        render={({ field }) => (
                          <FormItem>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger
                                  className={cn(
                                    "w-[180px] bg-black text-white",
                                  )}
                                >
                                  <SelectValue placeholder="Select a Type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent
                                className={cn("w-[180px] bg-black")}
                              >
                                <SelectGroup>
                                  <SelectGroup>
                                    {groupsQuery.data.map((name) => (
                                      <SelectItem value={name} key={name}>
                                        {name}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <Button
                        type={"button"}
                        className={cn("mx-2")}
                        variant={"secondary"}
                        onClick={() => remove(index)}
                      >
                        删除规则
                      </Button>
                    </div>
                  ))}
                </div>
                <div className={cn("my-2")}>
                  <Button
                    variant={"secondary"}
                    onClick={onAddRule}
                    type={"button"}
                  >
                    添加规则
                  </Button>
                  <Button
                    type={"submit"}
                    className={cn("mx-2")}
                    variant={"secondary"}
                  >
                    保存配置
                  </Button>
                </div>
              </div>
            ) : (
              <div>请先获取配置文件</div>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}
