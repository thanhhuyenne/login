git pull
npm run start-alert

git add .
git commit -m "noti"
git push

git checkout main
git pull origin main
git checkout feature/my-work
git merge main

git add .
git commit -m "Dashboards"
git push origin feature/my-work
