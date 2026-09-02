package service

import (
	"bytes"
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
// 系统设置提供默认值，用户级 syncOverride 覆盖优先（管理员账号同样生效）。
func UserSyncCapabilities(user model.AuthUser) map[string]bool {
	defaults := systemSyncDefaults()
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

// NormalizeSyncOverride 校验并规范化后台提交的用户同步覆盖：
// 兼容对象 {"userData":true,...} 和 JSON 字符串编码的对象两种形式；
// 仅接受 userData/workflows/assets 三个键，值只能是 null/true/false。
func NormalizeSyncOverride(raw json.RawMessage) (string, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return "", nil
	}
	// 前端可能把对象 stringify 后再发过来，此时先解出内层 JSON。
	if trimmed[0] == '"' {
		var encoded string
		if err := json.Unmarshal(trimmed, &encoded); err != nil {
			return "", err
		}
		trimmed = bytes.TrimSpace([]byte(encoded))
		if len(trimmed) == 0 || string(trimmed) == "null" {
			return "", nil
		}
	}
	var parsed map[string]*bool
	if err := json.Unmarshal(trimmed, &parsed); err != nil {
		return "", err
	}
	normalized := map[string]*bool{}
	for _, key := range []string{SyncCapabilityUserData, SyncCapabilityWorkflows, SyncCapabilityAssets} {
		if value, ok := parsed[key]; ok {
			normalized[key] = value
		}
	}
	data, err := json.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
