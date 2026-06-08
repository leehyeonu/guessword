#!/bin/bash

# 커밋 메시지 입력 확인
if [ -z "$1" ]
then
  echo "❌ 에러: 커밋 메시지를 입력해야 합니다."
  echo "👉 사용법: ./deploy.sh \"메시지 내용\""
  exit 1
fi

echo "=========================================="
echo "🚀 1. 로컬 코드 커밋 진행 중..."
echo "=========================================="
git add .
git commit -m "$1"

echo "=========================================="
echo "🐙 2. GitHub 푸시..."
echo "=========================================="
git push origin main

if [ $? -ne 0 ]; then
    echo "❌ GitHub 푸시 에러. 중단함."
    exit 1
fi

echo "=========================================="
echo "🤗 3. Hugging Face Spaces로 백엔드 코드 동기화..."
echo "=========================================="
git push huggingface `git subtree split --prefix=backend main`:main --force

if [ $? -ne 0 ]; then
    echo "❌ Hugging Face 동기화 실패."
    exit 1
fi

echo "=========================================="
echo "🎉 배포 완료!"
echo "=========================================="
