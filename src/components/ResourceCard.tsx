import { Resource, resourceTypeIcons } from "../types";

interface ResourceCardProps {
  resource: Resource;
}

export function ResourceCard({ resource }: ResourceCardProps) {
  return (
    <article className="resource-card">
      <span className="resource-icon">
        {resourceTypeIcons[resource.file_type]}
      </span>
      <div className="resource-info">
        <h4 className="resource-name">
          {resource.display_name || "未命名文件"}
        </h4>
        {resource.created_at && (
          <span className="resource-date">
            {resource.created_at.toLocaleDateString("zh-CN")}
          </span>
        )}
      </div>
    </article>
  );
}

