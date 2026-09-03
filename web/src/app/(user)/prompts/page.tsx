"use client";

import { FolderPlus, Search } from "lucide-react";
import { type UIEvent, useEffect, useState } from "react";
import { App, Button, Empty, Input, Spin } from "antd";

import { PromptCard } from "@/components/prompts/prompt-card";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/use-asset-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message } = App.useApp();
    const [titleInput, setTitleInput] = useState("");
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const { query, items: promptItems, tags: promptTags, categories: promptCategoryOptions, total: totalPrompts } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });

    useEffect(() => {
        if (query.isError) {
            message.error(query.error instanceof Error ? query.error.message : "获取提示词失败");
        }
    }, [message, query.error, query.isError]);

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success("已加入我的素材");
    };

    const searchByTitleInput = () => {
        setTitleKeyword(titleInput);
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) {
            void query.fetchNextPage();
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main
                className="min-h-0 flex-1 overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]"
                onScroll={handleListScroll}
           >
                <div className="pb-6">
                    <div className="mx-auto max-w-5xl text-center">
                        <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">提示词中心</h1>
                        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">共 {totalPrompts} 条提示词，按标题、标签与分类快速查找灵感。</p>
                    </div>
                </div>

                {!query.isLoading ? (
                    <div className="mx-auto grid max-w-[1600px] items-start gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
                        <aside className="space-y-6 self-start lg:sticky lg:top-6">
                            <div>
                                <div className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">分类</div>
                                <div className="thin-scrollbar max-h-72 space-y-0.5 overflow-y-auto pr-1">
                                    {promptCategoryOptions.map((category) => {
                                        const active = selectedCategory === category;
                                        return (
                                            <button
                                                key={category}
                                                type="button"
                                                onClick={() => setSelectedCategory(category)}
                                                className={cn(
                                                    "block w-full truncate rounded-md px-3 py-1.5 text-left text-sm transition",
                                                    active ? "bg-stone-900 font-medium text-white dark:bg-stone-100 dark:text-stone-900" : "text-stone-600 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800/60",
                                                )}
                                            >
                                                {category}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <div className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">标签</div>
                                <div className="thin-scrollbar max-h-96 space-y-0.5 overflow-y-auto pr-1">
                                    {promptTags.map((tag) => {
                                        const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
                                        return (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => toggleTag(tag)}
                                                className={cn(
                                                    "block w-full truncate rounded-md px-3 py-1.5 text-left text-sm transition",
                                                    active ? "bg-stone-900 font-medium text-white dark:bg-stone-100 dark:text-stone-900" : "text-stone-600 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800/60",
                                                )}
                                            >
                                                {tag}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </aside>
                        <div className="min-w-0">
                            <div className="mb-6 max-w-2xl">
                                <Input size="large" className="w-full" prefix={<Search className="size-4 text-stone-400" />} value={titleInput} placeholder="按标题查询，按 Enter 搜索" onChange={(event) => setTitleInput(event.target.value)} onPressEnter={searchByTitleInput} />
                            </div>
                            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                                {promptItems.map((item) => (
                                    <PromptCard
                                        key={item.id}
                                        item={item}
                                        onOpen={() => setSelectedPrompt(item)}
                                        onCopy={() => copyText(item.prompt, "提示词已复制")}
                                        extraAction={
                                            <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>
                                                加入我的素材
                                            </Button>
                                        }
                                    />
                                ))}
                            </div>
                            {promptItems.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-16" /> : null}
                            <div className="mt-6 text-center text-xs text-stone-500 dark:text-stone-400">
                                {query.isFetchingNextPage ? "加载中..." : query.hasNextPage ? "继续向下滚动加载更多" : promptItems.length > 0 ? "已经到底了" : null}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-60 items-center justify-center">
                        <Spin />
                    </div>
                )}
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, "提示词已复制")} onSaveAsset={savePromptAsset} />
        </div>
    );
}
