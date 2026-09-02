package service

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// HomeBanner 首页轮播图配置项。
type HomeBanner struct {
	ImageURL string `json:"imageUrl"`
	VideoURL string `json:"videoUrl,omitempty"`
	LinkURL  string `json:"linkUrl,omitempty"`
	Alt      string `json:"alt,omitempty"`
}

type bannerConfig struct {
	Items []HomeBanner `json:"items"`
}

// ListBanners 读取 banners/banners.json 返回首页轮播图列表；
// 文件缺失或格式错误时返回空列表，由前端使用内置兜底数据。
func ListBanners() []HomeBanner {
	data, err := os.ReadFile(filepath.Join("banners", "banners.json"))
	if err != nil {
		return []HomeBanner{}
	}
	var config bannerConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return []HomeBanner{}
	}
	if config.Items == nil {
		return []HomeBanner{}
	}
	return config.Items
}
