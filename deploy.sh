#!/bin/bash

# Check if commit message is provided
if [ -z "$1" ]
then
  echo "❌ 오류: 커밋 메시지를 입력해 주세요."
  echo "👉 사용법: ./deploy.sh \"내용 수정 및 배포\""
  exit 1
fi

echo "=========================================="
echo "🚀 1. 로컬 변경 사항 스테이징 및 커밋 중..."
echo "=========================================="
git add .
git commit -m "$1"

echo "=========================================="
echo "🐙 2. GitHub에 전체 프로젝트 푸시 중..."
echo "=========================================="
git push origin main

if [ $? -ne 0 ]; then
    echo "❌ GitHub 푸시 실패. 배포를 중단합니다."
    exit 1
fi

echo "=========================================="
echo "🤗 3. Hugging Face Spaces에 백엔드 소스 푸시 중..."
echo "=========================================="
git push huggingface `git subtree split --prefix=backend main`:main --force

if [ $? -ne 0 ]; then
    echo "❌ Hugging Face 푸시 실패."
    exit 1
fi

echo "=========================================="
echo "🎉 모든 저장소에 성공적으로 배포 완료!"
echo "=========================================="
