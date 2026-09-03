"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Checkbox, Empty, Flex, Form, Input, Modal, Popconfirm, Select, Space, Spin, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { nanoid } from "nanoid";

import { fetchAdminWorkflowTemplates, saveAdminWorkflowTemplate, deleteAdminWorkflowTemplate, fetchAdminSettings, type AdminWorkflowTemplate, type AdminModelChannel } from "@/services/api/admin";
import { filterChannelModelsByCapability } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type WorkflowVariableType = "text" | "textarea" | "number" | "select" | "boolean";

type WorkflowVariable = {
    id: string;
    key: string;
    label: string;
    type: WorkflowVariableType;
    required: boolean;
    defaultValue: string;
    options: string[];
    placeholder?: string;
};

type WorkflowMode = "single_image" | "multi_image_series";

// 与用户端 workbench 相同结构
type WorkflowData = {
    mode: WorkflowMode;
    variables: WorkflowVariable[];
    config: Record<string, unknown>;
    seriesConfig: Record<string, unknown>;
};

const variableTypeOptions: Array<{ value: WorkflowVariableType; label: string }> = [
    { value: "text", label: "短文本" },
    { value: "textarea", label: "长文本" },
    { value: "number", label: "数字" },
    { value: "select", label: "选项" },
    { value: "boolean", label: "开关" },
];

const workflowModeOptions: Array<{ value: WorkflowMode; label: string }> = [
    { value: "single_image", label: "单图生成" },
    { value: "multi_image_series", label: "多图生成" },
];

const apiModeOptions = [
    { value: "images", label: "Images API" },
    { value: "responses", label: "Responses API" },
    { value: "chat", label: "Chat Completions" },
];

const qualityOptions = [
    { value: "auto", label: "自动" },
    { value: "high", label: "高" },
    { value: "medium", label: "中" },
    { value: "low", label: "低" },
];

const sizeOptions = [
    { value: "auto", label: "自适应" },
    { value: "1:1", label: "1:1" },
    { value: "3:2", label: "3:2" },
    { value: "2:3", label: "2:3" },
    { value: "4:3", label: "4:3" },
    { value: "3:4", label: "3:4" },
    { value: "16:9", label: "16:9" },
    { value: "9:16", label: "9:16" },
    { value: "21:9", label: "21:9" },
];

const WORKFLOW_DEFAULTS = {
    single: {
        mode: "single_image" as WorkflowMode,
        variables: [],
        config: {
            apiMode: "images",
            quality: "auto",
            size: "auto",
            count: "1",
            timeout: "600",
            systemPrompt: "",
            promptTemplate: "",
            negativePrompt: "",
        },
        seriesConfig: {},
    },
    series: {
        mode: "multi_image_series" as WorkflowMode,
        variables: [],
        config: {
            apiMode: "images",
            quality: "auto",
            size: "auto",
            count: "1",
            timeout: "600",
            systemPrompt: "",
            promptTemplate: "",
            negativePrompt: "",
        },
        seriesConfig: { targetCount: "4", promptInstruction: "", reviewRequired: true, concurrency: "3" },
    },
};

// 兼容三种形态：对象（正常）、JSON 字符串（历史误存）、双重编码字符串；全部归一为 WorkflowData。
function parseWorkflowData(raw: Record<string, unknown> | string | undefined): WorkflowData {
    let parsed: unknown = raw;
    for (let depth = 0; depth < 2 && typeof parsed === "string"; depth++) {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = null;
            break;
        }
    }
    if (!parsed || typeof parsed !== "object") {
        return { ...WORKFLOW_DEFAULTS.single, variables: [] };
    }
    const source = parsed as Partial<WorkflowData>;
    const base = source.mode === "multi_image_series" ? WORKFLOW_DEFAULTS.series : WORKFLOW_DEFAULTS.single;
    return {
        mode: source.mode === "multi_image_series" ? "multi_image_series" : "single_image",
        variables: Array.isArray(source.variables) ? source.variables.map(normalizeVariable) : [],
        config: { ...base.config, ...(source.config || {}) },
        seriesConfig: { ...base.seriesConfig, ...(source.seriesConfig || {}) },
    };
}

function normalizeVariable(variable: WorkflowVariable): WorkflowVariable {
    const key = String(variable?.key || "").replace(/[^\w.-]/g, "_");
    return {
        id: variable.id || nanoid(),
        key,
        label: variable.label || key || "变量",
        type: variable.type || "text",
        required: variable.required !== false,
        defaultValue: variable.defaultValue == null ? "" : String(variable.defaultValue),
        options: Array.isArray(variable.options) ? variable.options.map(String) : [],
        placeholder: variable.placeholder,
    };
}

function createVariable(): WorkflowVariable {
    return { id: nanoid(), key: "", label: "", type: "text", required: true, defaultValue: "", options: [] };
}

// 种子模板：与旧版前端内置模板一致
function createSeedSingle(): WorkflowData {
    return {
        mode: "single_image",
        variables: [
            { id: nanoid(), key: "product_name", label: "产品名称", type: "text", required: true, defaultValue: "", options: [] },
            { id: nanoid(), key: "selling_points", label: "核心卖点", type: "textarea", required: true, defaultValue: "", options: [] },
            { id: nanoid(), key: "campaign", label: "活动信息", type: "text", required: true, defaultValue: "", options: [] },
        ],
        config: {
            apiMode: "images",
            quality: "auto",
            size: "auto",
            count: "1",
            timeout: "600",
            systemPrompt: "",
            promptTemplate: "为 {{product_name}} 生成一张高端电商海报。\n核心卖点：{{selling_points}}\n活动信息：{{campaign}}\n要求：主体清晰、构图高级、商品有强烈质感，画面适合社交媒体和电商首图。",
            negativePrompt: "",
        },
        seriesConfig: {},
    };
}

function createSeedSeries(): WorkflowData {
    return {
        mode: "multi_image_series",
        variables: [
            { id: nanoid(), key: "article_topic", label: "文章主题", type: "text", required: true, defaultValue: "", options: [] },
            { id: nanoid(), key: "article_content", label: "文章内容", type: "textarea", required: true, defaultValue: "", options: [] },
            { id: nanoid(), key: "visual_style", label: "视觉风格", type: "text", required: true, defaultValue: "", options: [] },
        ],
        config: {
            apiMode: "images",
            quality: "auto",
            size: "auto",
            count: "1",
            timeout: "600",
            systemPrompt: "",
            promptTemplate: "为小红书/公众号文章《{{article_topic}}》生成系列配图。\n文章内容：{{article_content}}\n视觉风格：{{visual_style}}\n要求：画面适合移动端阅读，主题连贯，每张图表达一个清晰信息点。",
            negativePrompt: "",
        },
        seriesConfig: {
            targetCount: "6",
            promptInstruction: "拆成封面图、问题/痛点图、核心步骤图、细节说明图、对比/案例图和总结图；每张图都需要独立完整的图片提示词。",
            reviewRequired: true,
            concurrency: "3",
        },
    };
}

export default function AdminWorkflowsPage() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token) || "";
    const [editingItem, setEditingItem] = useState<Partial<AdminWorkflowTemplate> | null>(null);
    const [data, setData] = useState<WorkflowData>({ ...WORKFLOW_DEFAULTS.single, variables: [] });
    const [form] = Form.useForm();
    const [publicChannels, setPublicChannels] = useState<AdminModelChannel[]>([]);
    const [availableModels, setAvailableModels] = useState<string[]>([]);

    useEffect(() => {
        if (!token) return;
        fetchAdminSettings(token)
            .then((settings) => {
                // 渠道模型从私有配置取：公开配置里的 channels 可能未同步，不可靠
                setPublicChannels((settings.private.channels || []).filter((channel) => channel.enabled !== false && channel.baseUrl && (channel.models || []).length));
                setAvailableModels(settings.public.modelChannel.availableModels || []);
            })
            .catch(() => undefined);
    }, [token]);

    const templatesQuery = useQuery({
        queryKey: ["admin", "workflow-templates", token],
        queryFn: () => fetchAdminWorkflowTemplates(token),
        enabled: Boolean(token),
        retry: false,
    });

    const saveMutation = useMutation({
        mutationFn: (item: Partial<AdminWorkflowTemplate>) => saveAdminWorkflowTemplate(token, item),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "workflow-templates"] });
            message.success("工作流模板已保存");
            setEditingItem(null);
        },
        onError: (error) => {
            message.error(error instanceof Error ? error.message : "保存失败");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminWorkflowTemplate(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "workflow-templates"] });
            message.success("工作流模板已删除");
        },
        onError: (error) => {
            message.error(error instanceof Error ? error.message : "删除失败");
        },
    });

    const openEdit = (item?: AdminWorkflowTemplate) => {
        if (item) {
            form.setFieldsValue({ name: item.name, category: item.category, description: item.description });
            setData(parseWorkflowData(item.data));
            setEditingItem(item);
        } else {
            form.resetFields();
            const seed = createSeedSingle();
            setData(seed);
            form.setFieldsValue({ name: "", category: "", description: "" });
            setEditingItem({});
        }
    };

    const openNewSeries = () => {
        form.resetFields();
        setData(createSeedSeries());
        form.setFieldsValue({ name: "", category: "", description: "" });
        setEditingItem({});
    };

    const patchData = (next: Partial<WorkflowData>) => setData((current) => ({ ...current, ...next }));

    const patchVariable = (id: string, next: Partial<WorkflowVariable>) =>
        patchData({ variables: data.variables.map((variable) => (variable.id === id ? normalizeVariable({ ...variable, ...next }) : variable)) });

    const removeVariable = (id: string) => patchData({ variables: data.variables.filter((variable) => variable.id !== id) });

    const save = async () => {
        const values = await form.validateFields();
        // data 必须以对象发送：后端 json.RawMessage 原样捕获，stringify 后会双重编码
        const payload: Partial<AdminWorkflowTemplate> = { ...editingItem, ...values, data: data as unknown as Record<string, unknown> };
        saveMutation.mutate(payload);
    };

    const editorExtra = useMemo(
        () => ({
            data,
            patchData,
            patchVariable,
            removeVariable,
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [data],
    );

    return (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                <Typography.Text type="secondary">平台级工作流模板，所有用户可见并可通过「复制到个人」使用。</Typography.Text>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={() => templatesQuery.refetch()}>刷新</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>新增单图模板</Button>
                    <Button icon={<PlusOutlined />} onClick={openNewSeries}>新增多图模板</Button>
                </Space>
            </Flex>

            {templatesQuery.isLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spin /></div>
            ) : (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {(templatesQuery.data?.items || []).map((item) => {
                        const parsed = parseWorkflowData(item.data);
                        return (
                            <Card key={item.id} size="small" hoverable>
                                <Flex gap={16} align="flex-start">
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Flex gap={8} align="center" style={{ marginBottom: 4 }}>
                                            <Typography.Text strong>{item.name}</Typography.Text>
                                            <Tag color="blue">公开</Tag>
                                            <Tag>{item.category}</Tag>
                                            <Tag color={parsed.mode === "multi_image_series" ? "purple" : undefined}>{parsed.mode === "multi_image_series" ? "多图" : "单图"}</Tag>
                                        </Flex>
                                        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                                            {item.description}
                                        </Typography.Paragraph>
                                    </div>
                                    <Space>
                                        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(item)}>编辑</Button>
                                        <Popconfirm title="确定删除该模板吗？" onConfirm={() => deleteMutation.mutate(item.id)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                                            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                                        </Popconfirm>
                                    </Space>
                                </Flex>
                            </Card>
                        );
                    })}
                    {!templatesQuery.data?.items?.length ? (
                        <Card size="small"><Empty description="暂无工作流模板，点击右上角新增" /></Card>
                    ) : null}
                </Space>
            )}

            <Modal title={editingItem?.id ? "编辑工作流模板" : "新增工作流模板"} open={Boolean(editingItem)} width={900} onCancel={() => setEditingItem(null)} onOk={() => void save()} okText="保存" cancelText="取消" destroyOnHidden confirmLoading={saveMutation.isPending}>
                <WorkflowTemplateEditor form={form} publicChannels={publicChannels} availableModels={availableModels} {...editorExtra} />
            </Modal>
        </div>
    );
}

function WorkflowTemplateEditor({
    form,
    data,
    publicChannels,
    availableModels,
    patchData,
    patchVariable,
    removeVariable,
}: {
    form: ReturnType<typeof Form.useForm>[0];
    data: WorkflowData;
    publicChannels: AdminModelChannel[];
    availableModels: string[];
    patchData: (next: Partial<WorkflowData>) => void;
    patchVariable: (id: string, next: Partial<WorkflowVariable>) => void;
    removeVariable: (id: string) => void;
}) {
    const patchConfig = (next: Record<string, unknown>) => patchData({ config: { ...data.config, ...next } });
    const patchSeriesConfig = (next: Record<string, unknown>) => patchData({ seriesConfig: { ...data.seriesConfig, ...next } });
    const enabledChannels = useMemo(() => publicChannels.map((channel) => ({ protocol: channel.protocol, models: channel.models || [] })), [publicChannels]);
    const allowedModels = availableModels.length ? availableModels : undefined;
    const imageModelOptions = filterChannelModelsByCapability(enabledChannels, "image", allowedModels).map((model) => ({ label: model, value: model }));
    const textModelOptions = filterChannelModelsByCapability(enabledChannels, "text", allowedModels).map((model) => ({ label: model, value: model }));
    const channelIdForModel = (model: string) => publicChannels.find((channel) => (channel.models || []).includes(model))?.id || "";

    return (
        <Form form={form} layout="vertical" requiredMark={false}>
            <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 8 }}>
                <Flex gap={12}>
                    <Form.Item name="name" label="模板名称" rules={[{ required: true, message: "请输入名称" }]} style={{ flex: 1, marginBottom: 12 }}>
                        <Input placeholder="如：电商海报生成" />
                    </Form.Item>
                    <Form.Item name="category" label="分类" style={{ width: 200, marginBottom: 12 }}>
                        <Input placeholder="如：电商海报" />
                    </Form.Item>
                </Flex>
                <Form.Item name="description" label="描述" style={{ marginBottom: 12 }}>
                    <Input.TextArea rows={2} placeholder="一句话描述适用场景" />
                </Form.Item>

                <Card size="small" title="生成模式" style={{ marginBottom: 12 }}>
                    <Select style={{ width: 200 }} value={data.mode} options={workflowModeOptions} onChange={(mode) => {
                        patchData({
                            mode,
                            seriesConfig: mode === "multi_image_series" ? { ...WORKFLOW_DEFAULTS.series.seriesConfig, ...data.seriesConfig } : {},
                        });
                    }} />
                </Card>

                <Card
                    size="small"
                    title={`输入变量（${data.variables.length}）`}
                    extra={<Button size="small" icon={<PlusOutlined />} onClick={() => patchData({ variables: [...data.variables, createVariable()] })}>添加变量</Button>}
                    style={{ marginBottom: 12 }}
                >
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                        {data.variables.map((variable) => (
                            <Flex key={variable.id} gap={8} align="center">
                                <Input size="small" style={{ width: 150 }} placeholder="变量名 product_name" value={variable.key} onChange={(e) => patchVariable(variable.id, { key: e.target.value })} />
                                <Input size="small" style={{ width: 130 }} placeholder="显示名称" value={variable.label} onChange={(e) => patchVariable(variable.id, { label: e.target.value })} />
                                <Select size="small" style={{ width: 110 }} value={variable.type} options={variableTypeOptions} onChange={(type) => patchVariable(variable.id, { type })} />
                                {variable.type === "select" ? (
                                    <Select size="small" mode="tags" style={{ minWidth: 140 }} placeholder="选项（回车添加）" value={variable.options} onChange={(options) => patchVariable(variable.id, { options })} tokenSeparators={[","]} />
                                ) : variable.type === "boolean" ? (
                                    <Select size="small" style={{ width: 90 }} value={variable.defaultValue} options={[{ value: "true", label: "默认开" }, { value: "false", label: "默认关" }]} onChange={(defaultValue) => patchVariable(variable.id, { defaultValue })} />
                                ) : (
                                    <Input size="small" style={{ width: 110 }} placeholder="默认值" value={variable.defaultValue} onChange={(e) => patchVariable(variable.id, { defaultValue: e.target.value })} />
                                )}
                                <Checkbox checked={variable.required} onChange={(e) => patchVariable(variable.id, { required: e.target.checked })}>必填</Checkbox>
                                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeVariable(variable.id)} />
                            </Flex>
                        ))}
                        {!data.variables.length ? <Typography.Text type="secondary">暂无变量，可添加产品名、文案等输入项。</Typography.Text> : null}
                    </Space>
                </Card>

                <Card size="small" title="提示词与生成配置" style={{ marginBottom: 12 }}>
                    <Flex gap={8} wrap="wrap" style={{ marginBottom: 8 }}>
                        <Select
                            style={{ minWidth: 240 }}
                            size="small"
                            showSearch
                            allowClear
                            placeholder="图片生成模型（留空跟随用户默认）"
                            value={(String(data.config.imageModel || data.config.model || "") || undefined) as string | undefined}
                            options={imageModelOptions}
                            onChange={(model) => patchConfig(model ? { imageModel: model, model, imageChannelId: channelIdForModel(model) } : { imageModel: "", model: "", imageChannelId: "" })}
                        />
                        {data.mode === "multi_image_series" ? (
                            <Select
                                style={{ minWidth: 240 }}
                                size="small"
                                showSearch
                                allowClear
                                placeholder="提示词规划模型（留空跟随用户默认）"
                                value={(String(data.seriesConfig.promptModel || "") || undefined) as string | undefined}
                                options={textModelOptions}
                                onChange={(model) => patchSeriesConfig(model ? { promptModel: model, promptChannelId: channelIdForModel(model) } : { promptModel: "", promptChannelId: "" })}
                            />
                        ) : null}
                    </Flex>
                    <div style={{ marginBottom: 8 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>用户提示词模板（用 {"{{变量名}}"} 引用变量）</Typography.Text>
                        <Input.TextArea rows={6} value={String(data.config.promptTemplate || "")} onChange={(e) => patchConfig({ promptTemplate: e.target.value })} />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>系统提示词（可选）</Typography.Text>
                        <Input.TextArea rows={2} value={String(data.config.systemPrompt || "")} onChange={(e) => patchConfig({ systemPrompt: e.target.value })} />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>负面提示词（可选）</Typography.Text>
                        <Input value={String(data.config.negativePrompt || "")} onChange={(e) => patchConfig({ negativePrompt: e.target.value })} />
                    </div>
                    <Flex gap={8} wrap="wrap">
                        <Select style={{ width: 150 }} size="small" value={String(data.config.apiMode || "images")} options={apiModeOptions} onChange={(apiMode) => patchConfig({ apiMode })} />
                        <Select style={{ width: 100 }} size="small" value={String(data.config.quality || "auto")} options={qualityOptions} onChange={(quality) => patchConfig({ quality })} />
                        <Select style={{ width: 110 }} size="small" value={String(data.config.size || "auto")} options={sizeOptions} onChange={(size) => patchConfig({ size })} />
                        <Input size="small" style={{ width: 90 }} addonBefore="张数" value={String(data.config.count || "1")} onChange={(e) => patchConfig({ count: e.target.value })} />
                    </Flex>
                </Card>

                {data.mode === "multi_image_series" ? (
                    <Card size="small" title="系列拆分配置">
                        <Flex gap={8} wrap="wrap" style={{ marginBottom: 8 }}>
                            <Input size="small" style={{ width: 90 }} addonBefore="目标张数" value={String(data.seriesConfig.targetCount || "4")} onChange={(e) => patchSeriesConfig({ targetCount: e.target.value })} />
                            <Input size="small" style={{ width: 90 }} addonBefore="并发" value={String(data.seriesConfig.concurrency || "3")} onChange={(e) => patchSeriesConfig({ concurrency: e.target.value })} />
                            <Checkbox checked={data.seriesConfig.reviewRequired !== false} onChange={(e) => patchSeriesConfig({ reviewRequired: e.target.checked })}>先审核提示词</Checkbox>
                        </Flex>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>拆分说明（如何拆成多张图）</Typography.Text>
                        <Input.TextArea rows={3} value={String(data.seriesConfig.promptInstruction || "")} onChange={(e) => patchSeriesConfig({ promptInstruction: e.target.value })} />
                    </Card>
                ) : null}
            </div>
        </Form>
    );
}