"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { fetchAdminBanners, saveAdminBanners, uploadAdminBannerImage, type AdminBanner } from "@/services/api/banners";
import { useUserStore } from "@/stores/use-user-store";

export function useAdminBanners() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token) || "";

    const bannersQuery = useQuery({
        queryKey: ["admin", "banners", token],
        queryFn: () => fetchAdminBanners(token),
        enabled: Boolean(token),
        retry: false,
    });

    const [items, setItems] = useState<AdminBanner[]>([]);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (bannersQuery.data) {
            setItems(bannersQuery.data.items);
            setDirty(false);
        }
    }, [bannersQuery.data]);

    const markDirty = () => setDirty(true);

    const saveMutation = useMutation({
        mutationFn: (next: AdminBanner[]) => saveAdminBanners(token, next),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "banners"] });
            setDirty(false);
            message.success("Banner 已保存，首页即时生效");
        },
        onError: (error) => {
            message.error(error instanceof Error ? error.message : "保存失败");
        },
    });

    const uploadMutation = useMutation({
        mutationFn: ({ file, replaceId }: { file: File; replaceId?: string }) => uploadAdminBannerImage(token, file),
        onSuccess: (result, variables) => {
            if (variables.replaceId) {
                setItems((current) => current.map((item) => (item.id === variables.replaceId ? { ...item, imageUrl: result.url } : item)));
            } else {
                setItems((current) => [
                    ...current,
                    { id: `banner-${Date.now()}`, imageUrl: result.url, videoUrl: "", linkUrl: "", alt: "", enabled: true },
                ]);
            }
            setDirty(true);
            message.success("图片已上传，记得点击保存");
        },
        onError: (error) => {
            message.error(error instanceof Error ? error.message : "上传失败");
        },
    });

    const updateItem = (id: string, patch: Partial<AdminBanner>) => {
        setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
        markDirty();
    };

    const removeItem = (id: string) => {
        setItems((current) => current.filter((item) => item.id !== id));
        markDirty();
    };

    const moveItem = (id: string, direction: -1 | 1) => {
        setItems((current) => {
            const index = current.findIndex((item) => item.id === id);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
        markDirty();
    };

    const addItemByExternalUrl = () => {
        setItems((current) => [
            ...current,
            { id: `banner-${Date.now()}`, imageUrl: "", videoUrl: "", linkUrl: "", alt: "", enabled: true },
        ]);
        markDirty();
    };

    return {
        items,
        dirty,
        isLoading: bannersQuery.isLoading,
        isError: bannersQuery.isError,
        isSaving: saveMutation.isPending,
        isUploading: uploadMutation.isPending,
        save: () => saveMutation.mutate(items),
        upload: (file: File, replaceId?: string) => uploadMutation.mutate({ file, replaceId }),
        updateItem,
        removeItem,
        moveItem,
        addItemByExternalUrl,
    };
}
