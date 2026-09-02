"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Empty, Flex, Form, Input, Modal, Space, Spin, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";

import { fetchAdminWorkflowTemplates, saveAdminWorkflowTemplate, deleteAdminWorkflowTemplate, type AdminWorkflowTemplate } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export default function AdminWorkflowsPage() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token) || "";
    const [editingItem, setEditingItem] = useState<Partial<AdminWorkflowTemplate> | null>(null);
    const [form] = Form.useForm();

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
            form.resetFields();
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
            let data = {};
            try { data = JSON.parse(item.data); } catch { /* ignore */ }
            form.setFieldsValue({ name: item.name, category: item.category, description: item.description, data: JSON.stringify(data, null, 2) });
            setEditingItem(item);
        } else {
            form.resetFields();
            setEditingItem({});
        }
    };

    const save = async () => {
        const values = await form.validateFields();
        const payload: Partial<AdminWorkflowTemplate> = { ...editingItem, ...values };
        saveMutation.mutate(payload);
    };

    return (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                <Typography.Text type="secondary">平台级工作流模板，所有用户登录后可见并可通过「复制到个人」使用。</Typography.Text>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={() => templatesQuery.refetch()}>刷新</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>新增模板</Button>
                </Space>
            </Flex>

            {templatesQuery.isLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spin /></div>
            ) : (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {(templatesQuery.data?.items || []).map((item) => (
                        <Card key={item.id} size="small" hoverable>
                            <Flex gap={16} align="flex-start">
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Flex gap={8} align="center" style={{ marginBottom: 4 }}>
                                        <Typography.Text strong>{item.name}</Typography.Text>
                                        <Tag color="blue">公开</Tag>
                                        <Tag>{item.category}</Tag>
                                    </Flex>
                                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                                        {item.description}
                                    </Typography.Paragraph>
                                </div>
                                <Space>
                                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(item)}>编辑</Button>
                                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteMutation.mutate(item.id)}>删除</Button>
                                </Space>
                            </Flex>
                        </Card>
                    ))}
                    {!templatesQuery.data?.items?.length ? (
                        <Card size="small"><Empty description="暂无工作流模板，点击右上角新增" /></Card>
                    ) : null}
                </Space>
            )}

            <Modal title={editingItem?.id ? "编辑工作流模板" : "新增工作流模板"} open={Boolean(editingItem)} width={680} onCancel={() => setEditingItem(null)} onOk={() => void save()} okText="保存" cancelText="取消" destroyOnHidden confirmLoading={saveMutation.isPending}>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入工作流名称" }]}>
                        <Input placeholder="如：电商海报生成" />
                    </Form.Item>
                    <Form.Item name="category" label="分类">
                        <Input placeholder="如：电商海报" />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <Input.TextArea rows={2} placeholder="一句话描述这个工作流的用途" />
                    </Form.Item>
                    <Form.Item name="data" label="工作流数据（JSON）" rules={[{ required: true, message: "请输入工作流数据" }]}>
                        <Input.TextArea rows={12} placeholder='{"variables":[...],"config":{...},"mode":"single_image"}' />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}