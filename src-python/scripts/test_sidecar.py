"""
测试 Python Sidecar 功能的脚本

运行方式：
    cd src-python
    uv run python scripts/test_sidecar.py
"""
import sys
import time
import requests
import subprocess
import signal

PYTHON_PORT = 8765
BASE_URL = f"http://127.0.0.1:{PYTHON_PORT}"


def test_health_check():
    """测试健康检查接口"""
    print("\n=== 测试 1: 健康检查 ===")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 健康检查成功: {data}")
            return True
        else:
            print(f"❌ 健康检查失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 健康检查异常: {e}")
        return False


def test_shutdown_endpoint():
    """测试关闭接口"""
    print("\n=== 测试 2: 关闭接口 ===")
    try:
        response = requests.post(f"{BASE_URL}/shutdown", timeout=2)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 关闭接口调用成功: {data}")
            return True
        else:
            print(f"❌ 关闭接口失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 关闭接口异常: {e}")
        return False


def test_stdin_monitor():
    """测试 stdin 监控机制（模拟父进程退出）"""
    print("\n=== 测试 3: stdin 监控机制 ===")
    print("启动 Python 子进程...")
    
    # 启动 Python 进程
    proc = subprocess.Popen(
        ["uv", "run", "python", "-m", "app.main", "--port", str(PYTHON_PORT)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    
    # 等待服务启动
    print("等待服务启动...")
    max_retries = 10
    for i in range(max_retries):
        time.sleep(1)
        try:
            response = requests.get(f"{BASE_URL}/health", timeout=1)
            if response.status_code == 200:
                print("✅ 服务已启动")
                break
        except:
            if i == max_retries - 1:
                print("❌ 服务启动超时")
                proc.kill()
                return False
    
    # 关闭 stdin，模拟父进程退出
    print("关闭 stdin（模拟父进程退出）...")
    proc.stdin.close()
    
    # 等待子进程自动退出
    try:
        proc.wait(timeout=5)
        print(f"✅ Python 进程自动退出，退出码: {proc.returncode}")
        return True
    except subprocess.TimeoutExpired:
        print("❌ Python 进程未能自动退出，强制终止")
        proc.kill()
        return False


def main():
    """主测试流程"""
    print("=" * 50)
    print("Python Sidecar 测试脚本")
    print("=" * 50)
    
    # 检查是否已有服务在运行
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=1)
        if response.status_code == 200:
            print("\n⚠️  检测到服务已在运行")
            print("请先停止正在运行的服务，然后重试")
            print("如果是独立测试，可以继续...")
            choice = input("是否继续测试？(y/n): ")
            if choice.lower() != 'y':
                return
            
            # 测试健康检查
            test_health_check()
            
            # 测试关闭接口
            test_shutdown_endpoint()
            
            # 等待服务关闭
            time.sleep(2)
    except:
        print("\n✅ 没有检测到运行中的服务，可以进行完整测试")
    
    # 测试 stdin 监控
    test_stdin_monitor()
    
    print("\n" + "=" * 50)
    print("测试完成")
    print("=" * 50)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n测试被用户中断")
        sys.exit(0)
