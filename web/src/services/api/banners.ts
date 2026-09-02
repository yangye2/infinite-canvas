import { apiGet } from "@/services/api/request";

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
