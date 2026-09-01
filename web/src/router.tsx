import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import HomePage from "@/pages/home";
import ImagePage from "@/pages/image";
import NotFound from "@/pages/not-found";
import PromptsPage from "@/pages/prompts";
import VideoPage from "@/pages/video";
import LoginPage from "@/pages/login";
import AdminLayout from "@/pages/admin/layout";
import AdminIndexPage from "@/pages/admin";
import AdminUsersPage from "@/pages/admin/users";
import AdminCreditLogsPage from "@/pages/admin/credit-logs";
import AdminPromptsPage from "@/pages/admin/prompts";
import AdminAssetsPage from "@/pages/admin/assets";
import AdminSettingsPage from "@/pages/admin/settings";

export const router = createBrowserRouter([
    {
        path: "/login",
        element: <LoginPage />,
    },
    {
        path: "/admin",
        element: <AdminLayout />,
        children: [
            { index: true, element: <AdminIndexPage /> },
            { path: "users", element: <AdminUsersPage /> },
            { path: "credit-logs", element: <AdminCreditLogsPage /> },
            { path: "prompts", element: <AdminPromptsPage /> },
            { path: "assets", element: <AdminAssetsPage /> },
            { path: "settings", element: <AdminSettingsPage /> },
        ],
    },
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/image", element: <ImagePage /> },
            { path: "/video", element: <VideoPage /> },
            { path: "/assets", element: <AssetsPage /> },
            { path: "/prompts", element: <PromptsPage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "/config", element: <ConfigPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
