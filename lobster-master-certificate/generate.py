#!/usr/bin/env python3
"""
龙虾驯养师证书生成器
Lobster Master Certificate Generator

Usage:
    python3 generate.py --name "张校长" --days 30 --lobster-name "小龙侠"
"""

import argparse
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path

# 配置
TEMPLATE_DIR = Path(__file__).parent / "template"
OUTPUT_DIR = Path(__file__).parent / "output"
TEMPLATE_FILE = TEMPLATE_DIR / "certificate.html"

# 颜色配置
COLORS = {
    "orange": "#FF6B35",
    "blue": "#003B5C",
    "light_blue": "#E8F4F8",
    "gold": "#FFD700"
}


def generate_cert_no():
    """生成证书编号"""
    timestamp = datetime.now().strftime("%Y%m%d")
    random_suffix = os.urandom(2).hex().upper()
    return f"LOB-{timestamp}-{random_suffix}"


def calculate_abilities(days):
    """基于驯养天数计算能力值"""
    # 基础值 + 天数加成（最高100%）
    combat = min(60 + days * 2, 100)
    intelligence = min(70 + days * 1.5, 120)
    return int(combat), int(intelligence)


def read_user_info():
    """从OpenClaw配置读取用户信息"""
    user_info = {
        "name": "未知学员",
        "lobster_name": "我的龙虾",
        "days": 3  # 默认3天（实战营时长）
    }
    
    # 尝试读取USER.md
    user_md = Path.home() / ".openclaw/workspace/USER.md"
    if user_md.exists():
        content = user_md.read_text(encoding="utf-8")
        # 提取名字
        name_match = re.search(r'## 基本信息\s*\n.*?(?:名字|称呼).*?:\s*(.+?)\s*\n', content, re.DOTALL)
        if name_match:
            user_info["name"] = name_match.group(1).strip()
    
    # 尝试读取SOUL.md获取龙虾名字
    soul_md = Path.home() / ".openclaw/workspace/SOUL.md"
    if soul_md.exists():
        content = soul_md.read_text(encoding="utf-8")
        # 尝试找到名字相关的行
        name_patterns = [
            r'名字[：:]\s*(.+?)\s*\n',
            r'我是(.+?)，',
            r'name[：:]\s*(.+?)\s*\n'
        ]
        for pattern in name_patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                user_info["lobster_name"] = match.group(1).strip()
                break
    
    return user_info


def generate_certificate(name=None, days=None, lobster_name=None, output_dir=None):
    """生成证书"""
    
    # 读取用户信息
    user_info = read_user_info()
    
    # 使用传入参数或默认值
    name = name or user_info["name"]
    days = days or user_info["days"]
    lobster_name = lobster_name or user_info["lobster_name"]
    
    # 计算能力值
    combat, intelligence = calculate_abilities(days)
    
    # 生成证书编号
    cert_no = generate_cert_no()
    
    # 当前日期
    date = datetime.now().strftime("%Y年%m月%d日")
    
    # 读取模板
    template = TEMPLATE_FILE.read_text(encoding="utf-8")
    
    # 替换变量
    template = template.replace("{{STUDENT_NAME}}", name)
    template = template.replace("{{COMBAT_POWER}}", str(combat))
    template = template.replace("{{INTELLIGENCE}}", str(intelligence))
    template = template.replace("{{DAYS}}", str(days))
    template = template.replace("{{LOBSTER_NAME}}", lobster_name)
    template = template.replace("{{DATE}}", date)
    template = template.replace("{{CERT_NO}}", cert_no)
    
    # 确保输出目录存在
    output_path = Path(output_dir) if output_dir else OUTPUT_DIR
    output_path.mkdir(parents=True, exist_ok=True)
    
    # 保存HTML
    html_file = output_path / f"证书-{name}.html"
    html_file.write_text(template, encoding="utf-8")
    
    # 使用Playwright或wkhtmltoimage转换为图片
    png_file = output_path / f"证书-{name}.png"
    pdf_file = output_path / f"证书-{name}.pdf"
    
    # 尝试使用wkhtmltoimage（如果安装）
    try:
        subprocess.run([
            "wkhtmltoimage",
            "--width", "794",
            "--height", "1123",
            "--quality", "100",
            str(html_file),
            str(png_file)
        ], check=True, capture_output=True)
        print(f"✓ PNG证书生成: {png_file}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        # 如果没有wkhtmltoimage，使用其他方法
        print(f"⚠ wkhtmltoimage未安装，仅生成HTML")
        print(f"  可手动用浏览器打开HTML文件，截图保存")
    
    print(f"✓ HTML证书生成: {html_file}")
    print(f"✓ 证书编号: {cert_no}")
    
    return {
        "html": html_file,
        "png": png_file if png_file.exists() else None,
        "cert_no": cert_no,
        "name": name,
        "days": days,
        "lobster_name": lobster_name,
        "combat": combat,
        "intelligence": intelligence
    }


def main():
    parser = argparse.ArgumentParser(description="龙虾驯养师证书生成器")
    parser.add_argument("--name", "-n", help="学员姓名")
    parser.add_argument("--days", "-d", type=int, help="驯养天数")
    parser.add_argument("--lobster-name", "-l", help="龙虾昵称")
    parser.add_argument("--output", "-o", help="输出目录")
    
    args = parser.parse_args()
    
    print("🦞 龙虾驯养师证书生成器")
    print("=" * 40)
    
    result = generate_certificate(
        name=args.name,
        days=args.days,
        lobster_name=args.lobster_name,
        output_dir=args.output
    )
    
    print("=" * 40)
    print(f"🎉 证书生成完成！")
    print(f"👤 学员: {result['name']}")
    print(f"🦞 龙虾: {result['lobster_name']}")
    print(f"📅 驯养: {result['days']}天")
    print(f"⚔️ 战斗力: {result['combat']}%")
    print(f"🧠 智商: {result['intelligence']}%")
    print(f"🏆 编号: {result['cert_no']}")


if __name__ == "__main__":
    main()
