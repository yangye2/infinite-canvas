package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
	"github.com/tigerowo/infinite-canvas/repository"
	"github.com/google/uuid"
)

type CreativeWorkflowPayload struct {
	ID          string          `json:"id"`
	OwnerUserID string          `json:"ownerUserId,omitempty"`
	Scope       string          `json:"scope"`
	Name        string          `json:"name"`
	Category    string          `json:"category"`
	Description string          `json:"description"`
	Data        json.RawMessage `json:"data"`
	CreatedAt   string          `json:"createdAt"`
	UpdatedAt   string          `json:"updatedAt"`
	LastRunAt   string          `json:"lastRunAt,omitempty"`
	Editable    bool            `json:"editable"`
}

type WorkflowAgentDraftRequest struct {
	Prompt      string   `json:"prompt"`
	Scope       string   `json:"scope"`
	Model       string   `json:"model"`
	ChannelID   string   `json:"channelId"`
	ChannelMode string   `json:"channelMode"`
	Protocol    string   `json:"protocol"`
	BaseURL     string   `json:"baseUrl"`
	APIKey      string   `json:"apiKey"`
	References  []string `json:"references"`
}

type WorkflowAgentDraftResponse struct {
	Draft    any      `json:"draft"`
	Warnings []string `json:"warnings"`
	Model    string   `json:"model"`
}

// WorkflowSystemOwner 系统工作流模板的属主标记（空字符串 = 平台级公共模板）。
const WorkflowSystemOwner = ""

// seedSystemWorkflowTemplates 首次访问时自动创建默认模板（幂等）。
func seedSystemWorkflowTemplates() {
	records, err := repository.ListSystemWorkflowTemplates()
	if err != nil || len(records) > 0 {
		return
	}
	for _, seed := range []CreativeWorkflowPayload{
		defaultSingleTemplate(),
		defaultSeriesTemplate(),
	} {
		_, _ = SaveWorkflowTemplate(seed)
	}
}

func defaultSingleTemplate() CreativeWorkflowPayload {
	return CreativeWorkflowPayload{
		Name:        "电商海报生成",
		Category:    "电商海报",
		Description: "固定海报构图、商业摄影质感和营销文案结构，只替换产品与卖点。",
		Data:        json.RawMessage(`{"mode":"single_image","variables":[{"id":"seed-product","key":"product_name","label":"产品名称","type":"text","required":true,"defaultValue":"","options":[]},{"id":"seed-selling","key":"selling_points","label":"核心卖点","type":"textarea","required":true,"defaultValue":"","options":[]},{"id":"seed-campaign","key":"campaign","label":"活动信息","type":"text","required":true,"defaultValue":"","options":[]}],"config":{"apiMode":"images","quality":"auto","size":"auto","count":"1","timeout":"600","systemPrompt":"","promptTemplate":"为 {{product_name}} 生成一张高端电商海报。\n核心卖点：{{selling_points}}\n活动信息：{{campaign}}\n要求：主体清晰、构图高级、商品有强烈质感，画面适合社交媒体和电商首图。","negativePrompt":""},"seriesConfig":{}}`),
	}
}

func defaultSeriesTemplate() CreativeWorkflowPayload {
	return CreativeWorkflowPayload{
		Name:        "小红书文章配图组",
		Category:    "多图创作",
		Description: "根据文章主题和内容生成多张风格统一的封面、步骤、要点和总结配图。",
		Data:        json.RawMessage(`{"mode":"multi_image_series","variables":[{"id":"seed-topic","key":"article_topic","label":"文章主题","type":"text","required":true,"defaultValue":"","options":[]},{"id":"seed-content","key":"article_content","label":"文章内容","type":"textarea","required":true,"defaultValue":"","options":[]},{"id":"seed-style","key":"visual_style","label":"视觉风格","type":"text","required":true,"defaultValue":"","options":[]}],"config":{"apiMode":"images","quality":"auto","size":"auto","count":"1","timeout":"600","systemPrompt":"","promptTemplate":"为小红书/公众号文章《{{article_topic}}》生成系列配图。\n文章内容：{{article_content}}\n视觉风格：{{visual_style}}\n要求：画面适合移动端阅读，主题连贯，每张图表达一个清晰信息点。","negativePrompt":""},"seriesConfig":{"targetCount":"6","promptInstruction":"拆成封面图、问题/痛点图、核心步骤图、细节说明图、对比/案例图和总结图；每张图都需要独立完整的图片提示词。","reviewRequired":true,"concurrency":"3"}}`),
	}
}

// ListWorkflowTemplates 后台：返回所有平台级公共模板（scope=public 且 owner 为空）。
func ListWorkflowTemplates() ([]CreativeWorkflowPayload, error) {
	seedSystemWorkflowTemplates()
	records, err := repository.ListSystemWorkflowTemplates()
	if err != nil {
		return nil, err
	}
	result := make([]CreativeWorkflowPayload, 0, len(records))
	for _, record := range records {
		result = append(result, creativeWorkflowPayload(record, WorkflowSystemOwner))
	}
	return result, nil
}

// normalizeWorkflowTemplateData 规范化模板 Data：
// 1) 若客户端误传 JSON 字符串字面量（双重编码），解码一层；2) 校验为合法 JSON 对象。
func normalizeWorkflowTemplateData(raw json.RawMessage) (json.RawMessage, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return json.RawMessage("{}"), nil
	}
	if trimmed[0] == '"' {
		var decoded string
		if err := json.Unmarshal(trimmed, &decoded); err != nil {
			return nil, errors.New("工作流数据格式错误")
		}
		trimmed = bytes.TrimSpace([]byte(decoded))
	}
	var check map[string]any
	if err := json.Unmarshal(trimmed, &check); err != nil {
		return nil, errors.New("工作流数据必须是 JSON 对象")
	}
	return trimmed, nil
}

// SaveWorkflowTemplate 后台：保存平台级工作流模板（scope 强制 public、owner 清空）。
func SaveWorkflowTemplate(payload CreativeWorkflowPayload) (CreativeWorkflowPayload, error) {
	scope := strings.ToLower(strings.TrimSpace(payload.Scope))
	if scope != "public" {
		scope = "public"
	}
	current := now()
	id := strings.TrimSpace(payload.ID)
	var existing model.CreativeWorkflow
	if id != "" {
		record, found, err := repository.GetCreativeWorkflow(id)
		if err != nil {
			return CreativeWorkflowPayload{}, err
		}
		if found {
			existing = record
		}
	}
	if id == "" {
		id = uuid.NewString()
	}
	createdAt := existing.CreatedAt
	if createdAt == "" {
		createdAt = current
	}
	record := model.CreativeWorkflow{
		ID:          id,
		OwnerUserID: WorkflowSystemOwner,
		Scope:       scope,
		Name:        strings.TrimSpace(payload.Name),
		Category:    strings.TrimSpace(payload.Category),
		Description: strings.TrimSpace(payload.Description),
		Data:        string(payload.Data),
		CreatedAt:   createdAt,
		UpdatedAt:   current,
	}
	if record.Name == "" {
		return CreativeWorkflowPayload{}, errors.New("请输入工作流名称")
	}
	normalizedData, err := normalizeWorkflowTemplateData(json.RawMessage(record.Data))
	if err != nil {
		return CreativeWorkflowPayload{}, err
	}
	record.Data = string(normalizedData)
	saved, err := repository.SaveCreativeWorkflow(record)
	if err != nil {
		return CreativeWorkflowPayload{}, err
	}
	return creativeWorkflowPayload(saved, WorkflowSystemOwner), nil
}

// DeleteWorkflowTemplate 后台：删除平台级工作流模板。
func DeleteWorkflowTemplate(id string) error {
	record, found, err := repository.GetCreativeWorkflow(id)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	if record.OwnerUserID != WorkflowSystemOwner {
		return errors.New("只能删除平台级工作流模板")
	}
	return repository.DeleteCreativeWorkflow(id)
}

func ListCreativeWorkflows(ctx context.Context) ([]CreativeWorkflowPayload, error) {
	user, ok := UserFromContext(ctx)
	if !ok || user.ID == "" {
		return nil, errors.New("请先登录")
	}
	if err := EnsureUserSyncAllowed(user, SyncCapabilityWorkflows); err != nil {
		return nil, err
	}
	records, err := repository.ListCreativeWorkflows(user.ID)
	if err != nil {
		return nil, err
	}
	result := make([]CreativeWorkflowPayload, 0, len(records))
	for _, record := range records {
		result = append(result, creativeWorkflowPayload(record, user.ID))
	}
	return result, nil
}

func SaveCreativeWorkflow(ctx context.Context, payload CreativeWorkflowPayload) (CreativeWorkflowPayload, error) {
	user, ok := UserFromContext(ctx)
	if !ok || user.ID == "" {
		return CreativeWorkflowPayload{}, errors.New("请先登录")
	}
	if err := EnsureUserSyncAllowed(user, SyncCapabilityWorkflows); err != nil {
		return CreativeWorkflowPayload{}, err
	}
	scope := strings.ToLower(strings.TrimSpace(payload.Scope))
	if scope != "public" {
		scope = "private"
	}
	current := now()
	id := strings.TrimSpace(payload.ID)
	var existing model.CreativeWorkflow
	if id != "" {
		record, found, err := repository.GetCreativeWorkflow(id)
		if err != nil {
			return CreativeWorkflowPayload{}, err
		}
		if found {
			if record.OwnerUserID != user.ID {
				return CreativeWorkflowPayload{}, errors.New("只能编辑自己的工作流")
			}
			existing = record
		}
	}
	if id == "" {
		id = uuid.NewString()
	}
	createdAt := existing.CreatedAt
	if createdAt == "" {
		createdAt = current
	}
	record := model.CreativeWorkflow{
		ID:          id,
		OwnerUserID: user.ID,
		Scope:       scope,
		Name:        strings.TrimSpace(payload.Name),
		Category:    strings.TrimSpace(payload.Category),
		Description: strings.TrimSpace(payload.Description),
		Data:        string(payload.Data),
		CreatedAt:   createdAt,
		UpdatedAt:   current,
		LastRunAt:   payload.LastRunAt,
	}
	if record.Name == "" {
		return CreativeWorkflowPayload{}, errors.New("请输入工作流名称")
	}
	if strings.TrimSpace(record.Data) == "" {
		record.Data = "{}"
	}
	saved, err := repository.SaveCreativeWorkflow(record)
	if err != nil {
		return CreativeWorkflowPayload{}, err
	}
	return creativeWorkflowPayload(saved, user.ID), nil
}

func DeleteCreativeWorkflow(ctx context.Context, id string) error {
	user, ok := UserFromContext(ctx)
	if !ok || user.ID == "" {
		return errors.New("请先登录")
	}
	if err := EnsureUserSyncAllowed(user, SyncCapabilityWorkflows); err != nil {
		return err
	}
	record, found, err := repository.GetCreativeWorkflow(id)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	if record.OwnerUserID != user.ID {
		return errors.New("只能删除自己的工作流")
	}
	return repository.DeleteCreativeWorkflow(id)
}

func creativeWorkflowPayload(record model.CreativeWorkflow, currentUserID string) CreativeWorkflowPayload {
	data := json.RawMessage(record.Data)
	if len(data) == 0 {
		data = json.RawMessage(`{}`)
	}
	return CreativeWorkflowPayload{
		ID:          record.ID,
		OwnerUserID: record.OwnerUserID,
		Scope:       record.Scope,
		Name:        record.Name,
		Category:    record.Category,
		Description: record.Description,
		Data:        data,
		CreatedAt:   record.CreatedAt,
		UpdatedAt:   record.UpdatedAt,
		LastRunAt:   record.LastRunAt,
		Editable:    record.OwnerUserID == currentUserID,
	}
}
