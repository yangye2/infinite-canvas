"use client";

import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Alert, Button, Card, Flex, Image, Input, Space, Spin, Switch, Typography, Upload } from "antd";

import { useAdminBanners } from "./use-admin-banners";

function BannerCard({
    index,
    total,
    item,
    isUploading,
    onUpdate,
    onRemove,
    onMove,
    onUpload,
}: {
    index: number;
    total: number;
    item: { id: string; imageUrl: string; videoUrl?: string; linkUrl?: string; alt?: string; enabled: boolean };
    isUploading: boolean;
    onUpdate: (id: string, patch: { imageUrl?: string; videoUrl?: string; linkUrl?: string; alt?: string; enabled?: boolean }) => void;
    onRemove: (id: string) => void;
    onMove: (id: string, direction: -1 | 1) => void;
    onUpload: (id: string, file: File) => void;
}) {
    return (
        <Card size="small" style={{ opacity: item.enabled ? 1 : 0.55 }}>
            <Flex gap={16} align="flex-start">
                <div style={{ flexShrink: 0 }}>
                    {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.alt || "banner"} width={176} height={99} style={{ objectFit: "cover", borderRadius: 8 }} />
                    ) : (
                        <div style={{ width: 176, height: 99, borderRadius: 8, background: "rgba(128,128,128,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Typography.Text type="secondary">无图片</Typography.Text>
                        </div>
                    )}
                </div>
                <Flex vertical gap={8} style={{ flex: 1, minWidth: 0 }}>
                    <Flex gap={8}>
                        <Input
                            placeholder="图片地址（上传或填写外链）"
                            value={item.imageUrl}
                            onChange={(event) => onUpdate(item.id, { imageUrl: event.target.value })}
                        />
                        <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { onUpload(item.id, file); return false; }}>
                            <Button icon={<UploadOutlined />} loading={isUploading}>替换图片</Button>
                        </Upload>
                    </Flex>
                    <Flex gap={8} wrap="wrap">
                        <Input
                            style={{ flex: 1, minWidth: 140 }}
                            placeholder="展示名称（无障碍描述）"
                            value={item.alt}
                            onChange={(event) => onUpdate(item.id, { alt: event.target.value })}
                        />
                        <Input
                            style={{ flex: 2, minWidth: 200 }}
                            placeholder="点击跳转链接（可选）"
                            value={item.linkUrl}
                            onChange={(event) => onUpdate(item.id, { linkUrl: event.target.value })}
                        />
                        <Input
                            style={{ flex: 2, minWidth: 200 }}
                            placeholder="视频地址（可选，激活时自动播放）"
                            value={item.videoUrl}
                            onChange={(event) => onUpdate(item.id, { videoUrl: event.target.value })}
                        />
                    </Flex>
                </Flex>
                <Flex vertical align="center" gap={8} style={{ flexShrink: 0 }}>
                    <Switch checked={item.enabled} checkedChildren="启用" unCheckedChildren="停用" onChange={(checked) => onUpdate(item.id, { enabled: checked })} />
                    <Space direction="vertical" size={4}>
                        <Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => onMove(item.id, -1)} title="上移" />
                        <Button size="small" icon={<ArrowDownOutlined />} disabled={index === total - 1} onClick={() => onMove(item.id, 1)} title="下移" />
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onRemove(item.id)} title="删除" />
                    </Space>
                </Flex>
            </Flex>
        </Card>
    );
}

export default function AdminBannersPage() {
    const { items, dirty, isLoading, isError, isSaving, isUploading, save, upload, updateItem, removeItem, moveItem, addItemByExternalUrl } = useAdminBanners();
    const { message } = App.useApp();

    if (isLoading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
                <Spin />
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                <Typography.Text type="secondary">首页轮播图按下方顺序展示；保存后写入服务端配置，首页即时生效。</Typography.Text>
                <Space>
                    <Button icon={<PlusOutlined />} onClick={addItemByExternalUrl}>外链图片</Button>
                    <Upload accept="image/webp,image/jpeg,image/png,image/gif" showUploadList={false} beforeUpload={(file) => { upload(file); return false; }}>
                        <Button type="primary" ghost icon={<PlusOutlined />} loading={isUploading}>上传图片</Button>
                    </Upload>
                    <Button type="primary" icon={<SaveOutlined />} loading={isSaving} disabled={isError} onClick={save}>保存</Button>
                </Space>
            </Flex>

            {isError ? (
                <Alert type="error" showIcon message="加载失败" description="无法获取 Banner 配置，请确认后端服务正常后刷新重试。" style={{ marginBottom: 16 }} />
            ) : null}

            {dirty ? (
                <Alert type="warning" showIcon message="有未保存的修改" style={{ marginBottom: 16 }} />
            ) : null}

            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {items.map((item, index) => (
                    <BannerCard
                        key={item.id}
                        index={index}
                        total={items.length}
                        item={item}
                        isUploading={isUploading}
                        onUpdate={updateItem}
                        onRemove={(id) => {
                            removeItem(id);
                            message.info("已移除，点击保存后生效");
                        }}
                        onMove={moveItem}
                        onUpload={(id, file) => upload(file, id)}
                    />
                ))}
                {items.length === 0 ? (
                    <Card size="small" style={{ textAlign: "center", padding: 24 }}>
                        <Typography.Text type="secondary">暂无 Banner，点击右上角「上传图片」添加第一张。</Typography.Text>
                    </Card>
                ) : null}
            </Space>

            <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
                说明：上传的图片保存在服务端 data/banners/ 目录（Docker 部署时随数据卷持久化）；删除条目不会删除已上传的图片文件。
            </Typography.Paragraph>
        </div>
    );
}
