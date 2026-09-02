package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"github.com/tigerowo/infinite-canvas/service"
)

// Banners 返回首页启用的轮播图列表（公开接口）。
func Banners(w http.ResponseWriter, r *http.Request) {
	OK(w, map[string]any{"items": service.ListBanners()})
}

// AdminBanners 返回后台管理的轮播图列表。
func AdminBanners(w http.ResponseWriter, r *http.Request) {
	OK(w, map[string]any{"items": service.ListAdminBanners()})
}

// AdminSaveBanners 保存后台轮播图配置（整表覆盖，含顺序）。
func AdminSaveBanners(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Items []service.ManagedBanner `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Fail(w, "请求格式错误")
		return
	}
	if err := service.SaveAdminBanners(body.Items); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

// AdminUploadBannerImage 上传轮播图图片，返回可访问的 URL 路径。
func AdminUploadBannerImage(w http.ResponseWriter, r *http.Request) {
	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择要上传的图片")
		return
	}
	defer file.Close()
	url, err := service.SaveBannerImage(fileHeader)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]string{"url": url})
}

// BannerImage 提供 banner 图片：优先运行期持久化目录 data/banners/，回退内置 banners/。
func BannerImage(w http.ResponseWriter, r *http.Request, name string) {
	name = filepath.Base(name)
	for _, dir := range []string{"data/banners", "banners"} {
		path := filepath.Join(dir, name)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			w.Header().Set("Cache-Control", "public, max-age=3600")
			http.ServeFile(w, r, path)
			return
		}
	}
	http.NotFound(w, r)
}
