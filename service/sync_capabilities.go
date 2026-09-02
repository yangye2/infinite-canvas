package service

import (
	"encoding/json"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
	"github.com/tigerowo/infinite-canvas/repository"
)

// 同步能力标识。
const (
	// SyncCapabilityUserData 画布项目与图片/视频生成历史。
	SyncCapabilityUserData = "userData"
	// SyncCapabilityWorkflows 创作工作流。
	SyncCapabilityWorkflows = "workflows"
	// SyncCapabilityAssets 素材库。
	SyncCapabilityAssets = "assets"
)

// systemSyncDefaults 读取系统设置里的默认同步开关；未配置（含旧数据）视为开启。
func systemSyncDefaults() map[string]bool {
	defaults := map[string]bool{
		SyncCapabilityUserData:  true,
		SyncCapabilityWorkflows: true,
		SyncCapabilityAssets:    true,
	}
	settings, err := repository.GetSettings()
	if err != nil {
		return defaults
	}
	sync := settings.Private.Sync
	if sync.UserData != nil {
		defaults[SyncCapabilityUserData] = *sync.UserData
	}
	if sync.Workflows != nil {
		defaults[SyncCapabilityWorkflows] = *sync.Workflows
	}
	if sync.Assets != nil {
		defaults[SyncCapabilityAssets] = *sync.Assets
	}
	return defaults
}

// parseSyncOverride 解析用户级覆盖配置：{"userData":null|true|false,...}。
// null 或缺失表示跟随系统默认。
func parseSyncOverride(raw string) map[string]*bool {
	result := map[string]*bool{}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return result
	}
	var parsed map[string]*bool
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return result
	}
	for key, value := range parsed {
		result[key] = value
	}
	return result
}

// UserSyncCapabilities 计算用户最终的同步能力：
// 系统设置提供默认值，用户级 syncOverride 覆盖优先；管理员不受限制。
func UserSyncCapabilities(user model.AuthUser) map[string]bool {
	defaults := systemSyncDefaults()
	if user.Role == model.UserRoleAdmin {
		return map[string]bool{
			SyncCapabilityUserData:  true,
			SyncCapabilityWorkflows: true,
			SyncCapabilityAssets:    true,
		}
	}
	override := map[string]*bool{}
	if saved, ok, err := repository.GetUserByID(user.ID); err == nil && ok {
		override = parseSyncOverride(saved.SyncOverride)
	}
	result := make(map[string]bool, len(defaults))
	for key, value := range defaults {
		result[key] = value
	}
	for key, value := range override {
		if value != nil {
			result[key] = *value
		}
	}
	return result
}

// EnsureUserSyncAllowed 校验用户是否允许同步指定数据；不允许时返回可安全提示的错误。
func EnsureUserSyncAllowed(user model.AuthUser, capability string) error {
	if !UserSyncCapabilities(user)[capability] {
		return safeMessageError{message: "管理员已关闭该数据的云同步"}
	}
	return nil
}
