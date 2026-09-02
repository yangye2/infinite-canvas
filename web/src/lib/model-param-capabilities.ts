// 模型参数能力表：根据官方文档维护各模型确定支持的参数范围。
// 返回 undefined 的模型表示"不确定"，调用方不应禁用任何参数。
// 文档来源：https://www.agnes-ai.com/zh-Hans/docs（图像 2.0/2.1/2.5、视频 2.0/2.5/2.5-flash）。

import { isAgnesVideoV25Model, modelKey } from "@/lib/video-model-capabilities";

export type ImageParamCapabilities = {
    // 支持的质量选项（"auto"/"high"/"medium"/"low"），undefined = 不限制
    qualities?: string[];
    // 支持的宽高比白名单（"16:9" 等），undefined = 不限制
    aspects?: string[];
    // 是否支持自定义宽高像素输入
    allowCustomDimensions?: boolean;
};

export type VideoParamCapabilities = {
    // 支持的分辨率档位（vquality 值："480"/"720"/"960"/"1080"/"2k"/"4k"），undefined = 不限制
    resolutions?: string[];
    // 支持的宽高比白名单，undefined = 不限制
    ratios?: string[];
    // 是否允许"自适应/auto"画幅
    allowAdaptiveRatio?: boolean;
    // 时长范围与预设秒数，undefined = 不限制
    seconds?: { presets: number[]; min: number; max: number };
    // 是否支持自定义宽高像素输入
    allowCustomDimensions?: boolean;
};

const AGNES_IMAGE_RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"];

export function isAgnesImageModel(modelName: string) {
    const value = modelKey(modelName);
    return value.startsWith("agnes-image");
}

// Agnes 图像（2.0/2.1/2.5）：size 档位 + ratio 白名单；质量档位映射到 1K-4K（全部支持）。
// 文档明确"精确尺寸可能被标准化"，自定义宽高输入保留可用（不确定是否被拒）。
export function getImageParamCapabilities(modelName: string): ImageParamCapabilities | undefined {
    if (!isAgnesImageModel(modelName)) return undefined;
    return {
        aspects: AGNES_IMAGE_RATIOS,
    };
}

// Agnes Video 2.5 / 2.5-flash：文档明确列出参数限制（400 拒绝）。
export function getVideoParamCapabilities(modelName: string): VideoParamCapabilities | undefined {
    if (!isAgnesVideoV25Model(modelName)) return undefined;
    const flash = modelKey(modelName) === "agnes-video-2-5-flash";
    return {
        // 2.5 支持 720P/960P/2K；flash 仅 720P。UI 现有档位映射为 720/2k（960 暂无对应档位）。
        resolutions: flash ? ["720"] : ["720", "2k"],
        ratios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        allowAdaptiveRatio: false,
        seconds: { presets: [4, 5, 6, 8, 10, 12], min: 4, max: 12 },
        allowCustomDimensions: false,
    };
}

// Agnes Video 2.5-flash 的文档专属限制。
export const AGNES_VIDEO_V25_FLASH = {
    maxReferenceImages: 5,
    maxReferenceAudios: 3,
    supportsVideoReferences: false,
} as const;

export function isAgnesVideoV25FlashModel(modelName: string) {
    return modelKey(modelName) === "agnes-video-2-5-flash";
}
