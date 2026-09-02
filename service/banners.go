package service

import (
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// HomeBanner 首页轮播图（公开接口返回的最小结构）。
type HomeBanner struct {
	ImageURL string `json:"imageUrl"`
	VideoURL string `json:"videoUrl,omitempty"`
	LinkURL  string `json:"linkUrl,omitempty"`
	Alt      string `json:"alt,omitempty"`
}

// ManagedBanner 后台管理的轮播图完整结构。
type ManagedBanner struct {
	ID       string `json:"id"`
	ImageURL string `json:"imageUrl"`
	VideoURL string `json:"videoUrl,omitempty"`
	LinkURL  string `json:"linkUrl,omitempty"`
	Alt      string `json:"alt,omitempty"`
	Enabled  bool   `json:"enabled"`
}

type bannerFile struct {
	Items []ManagedBanner `json:"items"`
}

const (
	bannerBakedDir = "banners"     // 随镜像分发的内置 banner 目录
	bannerDataDir  = "data/banners" // 运行期持久化目录（Docker 卷挂载）
)

var bannerImageExts = map[string]bool{
	".webp": true, ".jpg": true, ".jpeg": true, ".png": true, ".gif": true,
}

// bannerDataFile 返回后台管理的配置文件路径；不存在表示尚未在后台保存过。
func bannerDataFile() (string, bool) {
	path := filepath.Join(bannerDataDir, "banners.json")
	if _, err := os.Stat(path); err != nil {
		return "", false
	}
	return path, true
}

func readBannerItems(path string) ([]ManagedBanner, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var config bannerFile
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}
	return config.Items, nil
}

func writeBannerItems(path string, items []ManagedBanner) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(bannerFile{Items: items}, "", "    ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// listDefaultBanners 读取随镜像分发的内置 banners/banners.json 作为默认数据。
func listDefaultBanners() []ManagedBanner {
	data, err := os.ReadFile(filepath.Join(bannerBakedDir, "banners.json"))
	if err != nil {
		return []ManagedBanner{}
	}
	var defaults struct {
		Items []HomeBanner `json:"items"`
	}
	if err := json.Unmarshal(data, &defaults); err != nil {
		return []ManagedBanner{}
	}
	items := make([]ManagedBanner, 0, len(defaults.Items))
	for _, item := range defaults.Items {
		id := strings.TrimSuffix(filepath.Base(item.ImageURL), filepath.Ext(item.ImageURL))
		items = append(items, ManagedBanner{ID: id, ImageURL: item.ImageURL, VideoURL: item.VideoURL, LinkURL: item.LinkURL, Alt: item.Alt, Enabled: true})
	}
	return items
}

// normalizeBannerItems 补齐缺失 id 并过滤空图片项。
func normalizeBannerItems(items []ManagedBanner) []ManagedBanner {
	result := make([]ManagedBanner, 0, len(items))
	exists := map[string]bool{}
	for _, item := range items {
		if strings.TrimSpace(item.ImageURL) == "" {
			continue
		}
		if strings.TrimSpace(item.ID) == "" || exists[item.ID] {
			item.ID = fmt.Sprintf("banner-%d", time.Now().UnixNano())
		}
		for exists[item.ID] {
			item.ID += "-2"
		}
		exists[item.ID] = true
		result = append(result, item)
	}
	return result
}

// ListAdminBanners 后台列表：优先读取持久化配置，否则回退内置默认。
func ListAdminBanners() []ManagedBanner {
	if path, ok := bannerDataFile(); ok {
		if items, err := readBannerItems(path); err == nil {
			return normalizeBannerItems(items)
		}
	}
	return listDefaultBanners()
}

// SaveAdminBanners 保存后台配置到 data/banners/banners.json。
func SaveAdminBanners(items []ManagedBanner) error {
	return writeBannerItems(filepath.Join(bannerDataDir, "banners.json"), normalizeBannerItems(items))
}

// ListBanners 公开接口：返回启用的轮播图；后台未配置过时使用内置默认。
func ListBanners() []HomeBanner {
	var managed []ManagedBanner
	if path, ok := bannerDataFile(); ok {
		if items, err := readBannerItems(path); err == nil {
			managed = items
		}
	}
	if managed == nil {
		managed = listDefaultBanners()
	}
	result := make([]HomeBanner, 0, len(managed))
	for _, item := range managed {
		if !item.Enabled {
			continue
		}
		result = append(result, HomeBanner{ImageURL: item.ImageURL, VideoURL: item.VideoURL, LinkURL: item.LinkURL, Alt: item.Alt})
	}
	return result
}

// SaveBannerImage 保存上传的 banner 图片到 data/banners/，返回可访问的 URL 路径。
func SaveBannerImage(fileHeader *multipart.FileHeader) (string, error) {
	if fileHeader.Size > 20<<20 {
		return "", fmt.Errorf("图片大小不能超过 20MB")
	}
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !bannerImageExts[ext] {
		return "", fmt.Errorf("仅支持 webp/jpg/png/gif 图片")
	}
	if err := os.MkdirAll(bannerDataDir, 0o755); err != nil {
		return "", err
	}
	src, err := fileHeader.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()
	name := fmt.Sprintf("banner-%d%s", time.Now().UnixNano(), ext)
	dst, err := os.Create(filepath.Join(bannerDataDir, name))
	if err != nil {
		return "", err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, src); err != nil {
		return "", err
	}
	return "/banners/" + name, nil
}
