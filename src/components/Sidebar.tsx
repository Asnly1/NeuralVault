import { PageType, navItems } from "../types";

interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    //<aside> (侧边栏/旁支内容)
    // 含义：表示跟周围内容相关、但又相对独立的部分。
    // 用途：通常用于侧边栏、广告位、文章旁的引用块等。
    <aside className="sidebar">
      {/* <div> (块级容器)
      // 全称：Division（分割/区块）。
      // 行为：它是块级元素 (Block-level)。
      // 默认情况下，它会独占一行（宽度撑满父容器），强制后面的元素换行。
      // 你可以把它想象成一个大纸箱。
      // 用途：用于页面布局、将一组元素包在一起方便用 CSS 调整位置或样式。
    */}
      <div className="sidebar-brand">
        {/* <span> (行内容器)
      // 全称：Span（跨度/范围）。
      // 行为：它是行内元素 (Inline)。
      // 它不会换行，内容有多少它的宽度就是多少。
      // 你可以把它想象成一个透明塑料袋或者用荧光笔画出的范围。
      // 用途：用于在一段文字或一行内容中，单独选中一小块来进行样式修改（比如变色、加粗、放图标）。
    */}
        <span className="brand-icon">◆</span>
        <span className="brand-text">NeuralVault</span>
      </div>

      {/* <nav> (导航)
      // 含义：Navigation 的缩写，表示这是一组导航链接。
      // 用途：用于包裹菜单、目录、跳转按钮等。
    */}
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${currentPage === item.key ? "active" : ""}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-badge">
          <span className="user-avatar">U</span>
          <span className="user-name">用户</span>
        </div>
      </div>
    </aside>
  );
}
