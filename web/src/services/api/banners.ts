import { apiGet, apiPost } from "@/services/api/request";

export type ServerBanner = {
    imageUrl: string;
    videoUrl?: string;
    linkUrl?: string;
    alt?: string;
};

export type BannerListResponse = {
    items: ServerBanner[];
};

export async function fetchBanners() {
    return apiGet<BannerListResponse>("/api/banners");
}

// ---------- 后台管理 ----------

export type AdminBanner = {
    id: string;
    imageUrl: string;
    videoUrl?: string;
    linkUrl?: string;
    alt?: string;
    enabled: boolean;
};

export async function fetchAdminBanners(token: string) {
    return apiGet<BannerListResponse & { items: AdminBanner[] }>("/api/admin/banners", undefined, token);
}

export async function saveAdminBanners(token: string, items: AdminBanner[]) {
    return apiPost<boolean>("/api/admin/banners", { items }, token);
}

export async function uploadAdminBannerImage(token: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return apiPost<{ url: string }>("/api/admin/banners/upload", formData, token);
}
