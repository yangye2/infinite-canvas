package handler

import (
	"net/http"

	"github.com/tigerowo/infinite-canvas/service"
)

// Banners 返回首页轮播图列表（公开接口）。
func Banners(w http.ResponseWriter, r *http.Request) {
	OK(w, service.ListBanners())
}
